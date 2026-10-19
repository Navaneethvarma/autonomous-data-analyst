import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  getDatabaseAdapter,
  setDatabaseAdapter,
  MemoryDbAdapter,
  sanitizeConnectionString,
} from '../../src/lib/db/adapter.js';
import {
  getAnalysisQueue,
  setAnalysisQueue,
  InMemoryAnalysisQueue,
  processAnalysisJob,
  reconcileInterruptedJobs,
} from '../../src/lib/queue/analysis-queue.js';
import { createAppServer, ServerInstance } from '../../src/server/index.js';
import { DatasetStorageService } from '../../src/lib/dataset/storage.js';

describe('Milestone 11 Security & Reliability Correction Pass', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setDatabaseAdapter(null);
    setAnalysisQueue(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setDatabaseAdapter(null);
    setAnalysisQueue(null);
  });

  describe('1. Production Dependency Fail-Closed Behavior', () => {
    it('fails closed when DATABASE_URL is missing in production mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      expect(() => getDatabaseAdapter()).toThrow(
        /Missing DATABASE_URL.*PostgreSQL is mandatory/
      );
    });

    it('prohibits in-memory database fallback in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

      expect(() => getDatabaseAdapter(true)).toThrow(
        /MemoryDbAdapter.*is prohibited in production mode/
      );
    });

    it('fails closed when REDIS_URL is missing in production mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_URL;
      const memDb = new MemoryDbAdapter();

      expect(() => getAnalysisQueue(memDb)).toThrow(
        /Missing REDIS_URL.*Redis\/BullMQ is mandatory/
      );
    });

    it('prohibits in-memory queue fallback in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://user:pass@localhost:6379';
      const memDb = new MemoryDbAdapter();

      expect(() => getAnalysisQueue(memDb, true)).toThrow(
        /InMemoryAnalysisQueue.*is prohibited in production mode/
      );
    });

    it('sanitizes credentials in connection strings to prevent log leakage', () => {
      const sanitizedDb = sanitizeConnectionString('postgres://db_user:s3cr3t_p@ssword!@pg-cluster.internal:5432/analytics');
      expect(sanitizedDb).toBe('postgres://db_user:***@pg-cluster.internal:5432/analytics');
      expect(sanitizedDb).not.toContain('s3cr3t_p@ssword!');
    });
  });

  describe('2. Authentication, Cookies & CSRF Defense', () => {
    let serverInstance: ServerInstance;
    let baseUrl: string;
    let tempBaseDir: string;
    let db: MemoryDbAdapter;

    beforeAll(async () => {
      tempBaseDir = path.resolve(process.cwd(), 'datasets', `sec_test_${Date.now()}`);
      fs.mkdirSync(tempBaseDir, { recursive: true });

      db = new MemoryDbAdapter();
      const queue = new InMemoryAnalysisQueue(db);
      const storage = new DatasetStorageService(db, tempBaseDir);

      serverInstance = await createAppServer({
        db,
        queue,
        storage,
        port: 0,
      });
      baseUrl = `http://localhost:${serverInstance.port}`;
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

    it('enforces CSRF validation for cookie-authenticated mutating requests', async () => {
      // Register user
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'csrf-user@test.org',
          password: 'Password123!',
          name: 'CSRF User',
        }),
      });
      const regData = await regRes.json();
      const sessionToken = regData.token;
      const validCsrf = regData.csrfToken;

      expect(validCsrf).toBeDefined();

      // Make cookie-authenticated POST request WITHOUT x-csrf-token
      const noCsrfRes = await fetch(`${baseUrl}/api/analyses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${sessionToken}`,
        },
        body: JSON.stringify({
          datasetId: 'dummy-dataset-id',
          userQuery: 'Total revenue',
        }),
      });
      expect(noCsrfRes.status).toBe(403);
      const noCsrfData = await noCsrfRes.json();
      expect(noCsrfData.error).toContain('CSRF token missing');

      // Make cookie-authenticated POST request with INVALID x-csrf-token
      const badCsrfRes = await fetch(`${baseUrl}/api/analyses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${sessionToken}`,
          'X-CSRF-Token': 'invalid-csrf-token-12345',
        },
        body: JSON.stringify({
          datasetId: 'dummy-dataset-id',
          userQuery: 'Total revenue',
        }),
      });
      expect(badCsrfRes.status).toBe(403);
      const badCsrfData = await badCsrfRes.json();
      expect(badCsrfData.error).toContain('Invalid CSRF token');
    });

    it('enforces login rate limiting on rapid failed login attempts', async () => {
      // Rapidly attempt logins with bad password
      let lastStatus = 200;
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'nonexistent@test.org',
            password: 'BadPassword!',
          }),
        });
        lastStatus = res.status;
        await res.text();
      }

      // The 6th attempt should be blocked by rate limiter (limit = 5)
      expect(lastStatus).toBe(429);
    });
  });

  describe('3. Queue Durability, Worker Verification & Restart Recovery', () => {
    it('worker independently rejects dataset belonging to another tenant', async () => {
      const db = new MemoryDbAdapter();
      const orgA = 'org-tenant-alpha';
      const orgB = 'org-tenant-beta';

      // Create dataset belonging to Org B
      const dataset = await db.createDataset({
        id: 'dataset-belonging-to-b',
        organizationId: orgB,
        uploadedByUserId: 'user-b',
        originalFilename: 'tenant_b_data.csv',
        storagePath: 'datasets/sample_sales.csv',
        format: 'csv',
        fileSizeBytes: 1000,
        rowCount: 10,
        columnCount: 4,
        schemaFingerprint: 'abc12345',
        status: 'ready',
      });

      // Create analysis record in Org A attempting to access Org B dataset
      const analysisId = 'analysis-idor-attack';
      await db.createAnalysis({
        id: analysisId,
        organizationId: orgA,
        userId: 'user-a',
        datasetId: dataset.id,
        userQuery: 'Unauthorized question',
        jobId: 'job-1',
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
        retryCount: 0,
      });

      // Worker executes job
      await expect(
        processAnalysisJob(db, {
          analysisId,
          organizationId: orgA,
          userId: 'user-a',
          datasetId: dataset.id,
          datasetPath: dataset.storagePath,
          userQuery: 'Unauthorized question',
        })
      ).rejects.toThrow(/Dataset authorization error/);

      // Verify analysis in DB was marked as failed
      const updated = await db.getAnalysisById(analysisId);
      expect(updated?.status).toBe('failed');
      expect(updated?.errorMessage).toContain('Dataset authorization error');
    });

    it('reconciles interrupted jobs left in running state on application restart', async () => {
      const db = new MemoryDbAdapter();
      const orgId = 'org-reconcile-test';

      // Create a job that was left 'running' when server crashed
      await db.createAnalysis({
        id: 'interrupted-job-1',
        organizationId: orgId,
        userId: 'user-1',
        datasetId: 'dataset-1',
        userQuery: 'Revenue calculation',
        jobId: 'job-crashed',
        status: 'running',
        stage: 'execution',
        progressPercent: 50,
        retryCount: 0,
      });

      // Run reconciliation
      const count = await reconcileInterruptedJobs(db, orgId);
      expect(count).toBe(1);

      // Verify record is marked failed with clear explanation
      const reconciled = await db.getAnalysisById('interrupted-job-1');
      expect(reconciled?.status).toBe('failed');
      expect(reconciled?.errorMessage).toContain('Job interrupted by application restart');
    });
  });
});
