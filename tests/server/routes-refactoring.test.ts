import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { createAppServer, ServerInstance } from '../../src/server/index.js';
import { MemoryDbAdapter } from '../../src/lib/db/memory-adapter.js';
import { InMemoryAnalysisQueue } from '../../src/lib/queue/analysis-queue.js';
import { DatasetStorageService } from '../../src/lib/dataset/storage.js';

describe('Batch 3 — Route Refactoring & Modularity Verification', () => {
  let serverInstance: ServerInstance;
  let baseUrl: string;
  let tempBaseDir: string;
  let adminToken: string;
  let datasetId: string;

  beforeAll(async () => {
    tempBaseDir = path.resolve(process.cwd(), 'datasets', `test_batch3_routes_${Date.now()}`);
    fs.mkdirSync(tempBaseDir, { recursive: true });

    const db = new MemoryDbAdapter();
    const queue = new InMemoryAnalysisQueue(db);
    const storage = new DatasetStorageService(db, tempBaseDir);

    serverInstance = await createAppServer({
      db,
      queue,
      storage,
      port: 0,
      startScheduler: false,
    });

    baseUrl = `http://localhost:${serverInstance.port}`;

    // Register admin user
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'boss@enterprise.com',
        password: 'Password123!',
        name: 'Boss Analyst',
        organizationName: 'Batch3 Corp',
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    adminToken = regData.token;

    // Add viewer member
    await fetch(`${baseUrl}/api/auth/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'viewer@enterprise.com',
        role: 'viewer',
      }),
    });

    // Upload a test dataset
    const csvContent = 'region,sales,profit\nNorth,100,20\nSouth,200,50\nEast,150,30\n';
    const upRes = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        filename: 'sales_test.csv',
        content: csvContent,
      }),
    });
    expect(upRes.status).toBe(201);
    const upData = await upRes.json();
    datasetId = upData.dataset.id;
  });

  afterAll(async () => {
    await serverInstance.close();
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('1. Health Route', () => {
    it('returns 200 with healthy status', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
      expect(data.database).toBe('connected');
    });
  });

  describe('2. Authentication Routes', () => {
    it('returns current auth context on /api/auth/me', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.email).toBe('boss@enterprise.com');
      expect(data.role).toBe('admin');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
    });
  });

  describe('3. Dataset Routes', () => {
    it('lists datasets and retrieves dataset details, profile, and preview', async () => {
      const listRes = await fetch(`${baseUrl}/api/datasets`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(list.length).toBeGreaterThanOrEqual(1);

      const getRes = await fetch(`${baseUrl}/api/datasets/${datasetId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.status).toBe(200);
      const ds = await getRes.json();
      expect(ds.originalFilename).toBe('sales_test.csv');

      const profRes = await fetch(`${baseUrl}/api/datasets/${datasetId}/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(profRes.status).toBe(200);

      const prevRes = await fetch(`${baseUrl}/api/datasets/${datasetId}/preview?limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(prevRes.status).toBe(200);
      const preview = await prevRes.json();
      expect(preview.rowCount).toBe(3);
    });
  });

  describe('4. Schedule, Delivery & BI Routes', () => {
    let schedId: string;
    let destId: string;
    let biId: string;

    it('creates, inspects, and manages schedules', async () => {
      const createRes = await fetch(`${baseUrl}/api/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          datasetId,
          name: 'Morning Digest',
          userQuery: 'Total sales by region',
          scheduleType: 'recurring',
          cronExpression: '0 8 * * *',
          timezone: 'UTC',
        }),
      });
      expect(createRes.status).toBe(201);
      const schedData = await createRes.json();
      schedId = schedData.schedule.id;

      const listRes = await fetch(`${baseUrl}/api/schedules`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.status).toBe(200);

      const triggerRes = await fetch(`${baseUrl}/api/schedules/${schedId}/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(triggerRes.status).toBe(200);

      const runsRes = await fetch(`${baseUrl}/api/schedules/${schedId}/runs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(runsRes.status).toBe(200);
    });

    it('creates, inspects, and manages delivery destinations', async () => {
      const createRes = await fetch(`${baseUrl}/api/delivery/destinations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Slack Alerts',
          destinationType: 'webhook',
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00',
          secret: 'supersecret',
        }),
      });
      expect(createRes.status).toBe(201);
      const destData = await createRes.json();
      destId = destData.destination.id;
      expect(destData.destination.hasSecret).toBe(true);
      expect(destData.destination.encryptedSecret).toBeUndefined();

      const getRes = await fetch(`${baseUrl}/api/delivery/destinations/${destId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.status).toBe(200);

      const listRes = await fetch(`${baseUrl}/api/delivery/destinations`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.status).toBe(200);
    });

    it('creates, inspects, and tests BI platform connections', async () => {
      const createRes = await fetch(`${baseUrl}/api/bi/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Metabase Test',
          platformType: 'metabase',
          hostUrl: 'http://localhost:3000',
          username: 'admin@metabase.com',
          password: 'password123',
        }),
      });
      expect(createRes.status).toBe(201);
      const biData = await createRes.json();
      biId = biData.connection.id;
      expect(biData.connection.encryptedCredentials).toBeUndefined();

      const getRes = await fetch(`${baseUrl}/api/bi/connections/${biId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.status).toBe(200);

      const testRes = await fetch(`${baseUrl}/api/bi/connections/${biId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(testRes.status).toBe(200);
    });

    it('retrieves tenant audit logs via /api/audit/logs', async () => {
      const res = await fetch(`${baseUrl}/api/audit/logs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.logs)).toBe(true);
    });
  });
});
