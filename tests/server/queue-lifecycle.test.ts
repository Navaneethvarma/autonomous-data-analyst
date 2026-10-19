import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { InMemoryAnalysisQueue } from '../../src/lib/queue/analysis-queue.js';
import { CrossTenantAccessError } from '../../src/lib/auth/rbac.js';

describe('Background Queue Lifecycle, Retries & Cancellation (Milestone 11)', () => {
  let db: MemoryDbAdapter;
  let queue: InMemoryAnalysisQueue;
  const fixturePath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  beforeEach(() => {
    db = new MemoryDbAdapter();
    queue = new InMemoryAnalysisQueue(db);
  });

  afterEach(async () => {
    await queue.close();
  });

  it('progresses analysis through queued, running, and completed states with progress updates', async () => {
    const analysisId = 'ana-test-lifecycle-1';
    const orgId = 'org-lifecycle-1';

    await db.createDataset({
      id: 'ds-1',
      organizationId: orgId,
      uploadedByUserId: 'user-1',
      originalFilename: 'sample_sales.csv',
      storagePath: 'sample_sales.csv',
      format: 'csv',
      fileSizeBytes: 4000,
      rowCount: 25,
      columnCount: 8,
      schemaFingerprint: 'abc12345',
      status: 'ready',
    });

    await db.createAnalysis({
      id: analysisId,
      organizationId: orgId,
      userId: 'user-1',
      datasetId: 'ds-1',
      userQuery: 'What is the total gross revenue by product category?',
      jobId: 'pending',
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
      retryCount: 0,
    });

    const { jobId } = await queue.submitJob({
      analysisId,
      organizationId: orgId,
      userId: 'user-1',
      datasetId: 'ds-1',
      datasetPath: fixturePath,
      userQuery: 'What is the total gross revenue by product category?',
    });

    expect(jobId).toMatch(/^job_/);

    // Initial queued status
    const initial = await queue.getJobStatus(jobId, orgId);
    expect(initial?.status).toBe('queued');

    // Wait for async processing
    let attempts = 0;
    let finalRecord = null;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 400));
      finalRecord = await queue.getJobStatus(jobId, orgId);
      if (finalRecord?.status === 'completed' || finalRecord?.status === 'failed') {
        break;
      }
      attempts++;
    }

    expect(finalRecord?.status).toBe('completed');
    expect(finalRecord?.progressPercent).toBe(100);
    expect(finalRecord?.executionResultJson).toBeDefined();
    expect(finalRecord?.dashboardSpecJson).toBeDefined();

    // Verify generated artifacts saved in DB
    const artifacts = await db.listArtifactsByAnalysis(analysisId, orgId);
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some(a => a.artifactType === 'dashboard_spec')).toBe(true);
  });

  it('rejects cross-tenant job inspection and cancellation attempts', async () => {
    const analysisId = 'ana-cross-tenant-1';
    const tenantA = 'org-alpha';
    const tenantB = 'org-beta';

    await db.createAnalysis({
      id: analysisId,
      organizationId: tenantA,
      userId: 'user-a',
      datasetId: 'ds-a',
      userQuery: 'Total revenue',
      jobId: 'job_tenant_a_123',
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
      retryCount: 0,
    });

    // Tenant B cannot get status of Tenant A job
    await expect(queue.getJobStatus('job_tenant_a_123', tenantB)).rejects.toThrow(
      CrossTenantAccessError
    );

    // Tenant B cannot cancel Tenant A job
    await expect(queue.cancelJob('job_tenant_a_123', tenantB)).rejects.toThrow(
      CrossTenantAccessError
    );
  });

  it('cancels a running analysis and records cancelled state', async () => {
    const analysisId = 'ana-cancel-1';
    const orgId = 'org-cancel';

    await db.createAnalysis({
      id: analysisId,
      organizationId: orgId,
      userId: 'user-cancel',
      datasetId: 'ds-cancel',
      userQuery: 'Heavy long-running calculation',
      jobId: 'pending',
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
      retryCount: 0,
    });

    const { jobId } = await queue.submitJob({
      analysisId,
      organizationId: orgId,
      userId: 'user-cancel',
      datasetId: 'ds-cancel',
      datasetPath: fixturePath,
      userQuery: 'Heavy long-running calculation',
    });

    // Immediately cancel
    const cancelled = await queue.cancelJob(jobId, orgId);
    expect(cancelled).toBe(true);

    const record = await queue.getJobStatus(jobId, orgId);
    expect(record?.status).toBe('cancelled');
    expect(record?.errorMessage).toContain('cancelled');
  });
});
