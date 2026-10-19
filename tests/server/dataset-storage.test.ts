import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { AuthService, AuthenticatedContext } from '../../src/lib/auth/service.js';
import { DatasetStorageService } from '../../src/lib/dataset/storage.js';
import {
  UnsupportedFormatError,
  DatasetEmptyError,
  FileTooLargeError,
} from '../../src/lib/dataset/validator.js';
import { CrossTenantAccessError, AuthorizationError } from '../../src/lib/auth/rbac.js';

describe('Dataset Storage & Security (Milestone 11)', () => {
  let db: MemoryDbAdapter;
  let authService: AuthService;
  let storage: DatasetStorageService;
  let tempBaseDir: string;
  let tenantA: AuthenticatedContext;
  let tenantB: AuthenticatedContext;

  beforeEach(async () => {
    db = new MemoryDbAdapter();
    authService = new AuthService(db);
    tempBaseDir = path.join(os.tmpdir(), `ada_test_datasets_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tempBaseDir, { recursive: true });
    storage = new DatasetStorageService(db, tempBaseDir);

    const regA = await authService.register({
      email: 'user_a@tenant-a.com',
      password: 'Password123!',
      name: 'User A',
      organizationName: 'Tenant Alpha',
    });
    tenantA = await authService.authenticateToken(regA.token);

    const regB = await authService.register({
      email: 'user_b@tenant-b.com',
      password: 'Password123!',
      name: 'User B',
      organizationName: 'Tenant Beta',
    });
    tenantB = await authService.authenticateToken(regB.token);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup
    }
  });

  it('uploads, profiles, and registers a valid CSV dataset with tenant isolation', async () => {
    const csvContent = 'category,revenue,units\nTech,15000.50,30\nHealth,8400.00,15\n';
    const buffer = Buffer.from(csvContent, 'utf-8');

    const result = await storage.uploadAndRegisterDataset(tenantA, {
      originalFilename: 'q3_sales.csv',
      buffer,
    });

    expect(result.dataset.originalFilename).toBe('q3_sales.csv');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.dataset.columnCount).toBe(3);
    expect(result.dataset.format).toBe('csv');
    expect(result.dataset.organizationId).toBe(tenantA.organization.id);
    expect(fs.existsSync(result.dataset.storagePath)).toBe(true);

    // Profile check
    expect(result.profile.columns).toHaveLength(3);
    const revCol = result.profile.columns.find(c => c.name === 'revenue');
    expect(revCol?.inferredType).toBe('float');

    // Retrieve via service
    const retrieved = await storage.getDataset(tenantA, result.dataset.id);
    expect(retrieved.id).toBe(result.dataset.id);

    // List datasets
    const list = await storage.listDatasets(tenantA);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(result.dataset.id);
  });

  it('prevents cross-tenant access to datasets (Tenant B cannot read Tenant A dataset)', async () => {
    const csvContent = 'id,value\n1,100\n2,200\n';
    const buffer = Buffer.from(csvContent, 'utf-8');

    const result = await storage.uploadAndRegisterDataset(tenantA, {
      originalFilename: 'confidential_a.csv',
      buffer,
    });

    // Tenant B attempts to read Tenant A's dataset
    await expect(storage.getDataset(tenantB, result.dataset.id)).rejects.toThrow(
      CrossTenantAccessError
    );

    // Tenant B lists datasets -> returns empty list
    const listB = await storage.listDatasets(tenantB);
    expect(listB).toHaveLength(0);
  });

  it('rejects unsupported file extensions (.exe, .json, etc.)', async () => {
    const buffer = Buffer.from('console.log("bad")', 'utf-8');
    await expect(
      storage.uploadAndRegisterDataset(tenantA, {
        originalFilename: 'malicious.exe',
        buffer,
      })
    ).rejects.toThrow(UnsupportedFormatError);
  });

  it('rejects empty dataset uploads (0 bytes)', async () => {
    await expect(
      storage.uploadAndRegisterDataset(tenantA, {
        originalFilename: 'empty.csv',
        buffer: Buffer.alloc(0),
      })
    ).rejects.toThrow(DatasetEmptyError);
  });

  it('rejects oversized files exceeding size limits', async () => {
    // 51 MB buffer
    const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
    await expect(
      storage.uploadAndRegisterDataset(tenantA, {
        originalFilename: 'huge.csv',
        buffer: largeBuffer,
      })
    ).rejects.toThrow(FileTooLargeError);
  });

  it('enforces RBAC: Viewer cannot upload datasets', async () => {
    const buffer = Buffer.from('col1,col2\n1,2\n', 'utf-8');
    await expect(
      storage.uploadAndRegisterDataset(
        { ...tenantA, role: 'viewer' },
        {
          originalFilename: 'test.csv',
          buffer,
        }
      )
    ).rejects.toThrow(AuthorizationError);
  });

  it('deletes a dataset and cleans up the underlying physical file', async () => {
    const buffer = Buffer.from('col,val\na,1\nb,2\n', 'utf-8');
    const result = await storage.uploadAndRegisterDataset(tenantA, {
      originalFilename: 'to_delete.csv',
      buffer,
    });

    expect(fs.existsSync(result.dataset.storagePath)).toBe(true);

    await storage.deleteDataset(tenantA, result.dataset.id);

    expect(fs.existsSync(result.dataset.storagePath)).toBe(false);
    await expect(storage.getDataset(tenantA, result.dataset.id)).rejects.toThrow('not found');
  });
});
