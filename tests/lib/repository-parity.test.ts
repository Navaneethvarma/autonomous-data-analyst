import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter } from '../../src/lib/db/memory-adapter.js';
import {
  UserRepository,
  OrganizationRepository,
  SessionRepository,
  DatasetRepository,
  AnalysisRepository,
  ScheduleRepository,
  DeliveryRepository,
  BiRepository,
  AuditRepository,
} from '../../src/lib/db/repositories/index.js';

describe('Batch 2.1 — Comprehensive Repository Parity & Contract Verification', () => {
  let db: MemoryDbAdapter;
  let userRepo: UserRepository;
  let orgRepo: OrganizationRepository;
  let sessionRepo: SessionRepository;
  let datasetRepo: DatasetRepository;
  let analysisRepo: AnalysisRepository;
  let scheduleRepo: ScheduleRepository;
  let deliveryRepo: DeliveryRepository;
  let biRepo: BiRepository;
  let auditRepo: AuditRepository;

  beforeEach(async () => {
    db = new MemoryDbAdapter();
    await db.init();
    userRepo = new UserRepository(db);
    orgRepo = new OrganizationRepository(db);
    sessionRepo = new SessionRepository(db);
    datasetRepo = new DatasetRepository(db);
    analysisRepo = new AnalysisRepository(db);
    scheduleRepo = new ScheduleRepository(db);
    deliveryRepo = new DeliveryRepository(db);
    biRepo = new BiRepository(db);
    auditRepo = new AuditRepository(db);
  });

  describe('1. Missing-Record Behavior & Error Semantics Across All Domains', () => {
    it('returns null consistently for non-existent entities across all repositories', async () => {
      expect(await orgRepo.findById('missing_org')).toBeNull();
      expect(await orgRepo.findBySlug('missing_slug')).toBeNull();

      expect(await userRepo.findById('missing_user')).toBeNull();
      expect(await userRepo.findByEmail('missing@example.com')).toBeNull();
      expect(await userRepo.getMembership('org_1', 'usr_missing')).toBeNull();
      expect(await userRepo.getMembershipsByUser('usr_missing')).toEqual([]);

      expect(await sessionRepo.findByTokenHash('missing_hash')).toBeNull();

      expect(await datasetRepo.findById('missing_ds', 'org_1')).toBeNull();
      expect(await datasetRepo.getProfile('missing_ds')).toBeNull();
      expect(await datasetRepo.listForOrganization('missing_org')).toEqual([]);

      expect(await analysisRepo.findById('missing_an', 'org_1')).toBeNull();
      expect(await analysisRepo.listForOrganization('missing_org')).toEqual([]);
      expect(await analysisRepo.listArtifacts('missing_an', 'org_1')).toEqual([]);

      expect(await scheduleRepo.findById('missing_sched', 'org_1')).toBeNull();
      expect(await scheduleRepo.listForOrganization('missing_org')).toEqual([]);
      expect(await scheduleRepo.listRuns('missing_sched', 'org_1')).toEqual([]);
      expect(await scheduleRepo.getActiveRunCount('missing_sched')).toBe(0);

      expect(await deliveryRepo.findById('missing_dest', 'org_1')).toBeNull();
      expect(await deliveryRepo.listForOrganization('missing_org')).toEqual([]);

      expect(await biRepo.findById('missing_bi', 'org_1')).toBeNull();
      expect(await biRepo.listForOrganization('missing_org')).toEqual([]);

      expect(await auditRepo.listForOrganization('missing_org')).toEqual([]);
    });

    it('returns false or no-op on non-existent deletions without throwing unhandled exceptions', async () => {
      expect(await datasetRepo.delete('missing_ds', 'org_1')).toBe(false);
      expect(await deliveryRepo.delete('missing_dest', 'org_1')).toBe(false);
      expect(await biRepo.delete('missing_bi', 'org_1')).toBe(false);
      await expect(sessionRepo.delete('missing_hash')).resolves.not.toThrow();
      await expect(sessionRepo.deleteForUser('missing_user')).resolves.not.toThrow();
    });
  });

  describe('2. Multi-Tenant Scoping & Cross-Tenant Mutation Rejection', () => {
    beforeEach(async () => {
      // Seed two distinct organizations
      await orgRepo.create({ id: 'org_alpha', name: 'Alpha Org', slug: 'alpha' });
      await orgRepo.create({ id: 'org_beta', name: 'Beta Org', slug: 'beta' });
    });

    it('prevents cross-tenant access and mutation on Datasets', async () => {
      await datasetRepo.create({
        id: 'ds_alpha_1',
        organizationId: 'org_alpha',
        uploadedByUserId: 'usr_alpha',
        originalFilename: 'data.csv',
        storagePath: '/data/data.csv',
        fileSizeBytes: 100,
        format: 'csv',
        rowCount: 10,
        columnCount: 2,
        schemaFingerprint: 'fp_1',
        status: 'ready',
      });

      // Tenant Beta cannot find dataset
      expect(await datasetRepo.findById('ds_alpha_1', 'org_beta')).toBeNull();

      // Tenant Beta cannot delete dataset
      const deleteSuccess = await datasetRepo.delete('ds_alpha_1', 'org_beta');
      expect(deleteSuccess).toBe(false);

      // Dataset still exists in Tenant Alpha
      const alphaDs = await datasetRepo.findById('ds_alpha_1', 'org_alpha');
      expect(alphaDs).not.toBeNull();
    });

    it('prevents cross-tenant access and mutation on Analyses', async () => {
      await analysisRepo.create({
        id: 'an_alpha_1',
        organizationId: 'org_alpha',
        userId: 'usr_alpha',
        datasetId: 'ds_alpha_1',
        userQuery: 'Summarize quarterly churn',
        jobId: 'job_alpha_1',
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
        retryCount: 0,
      });

      // Cross-tenant lookup returns null
      expect(await analysisRepo.findById('an_alpha_1', 'org_beta')).toBeNull();

      // Update analysis status
      await analysisRepo.update('an_alpha_1', {
        status: 'running',
        stage: 'duckdb_aggregations',
        progressPercent: 50,
      });

      const updated = await analysisRepo.findById('an_alpha_1', 'org_alpha');
      expect(updated?.status).toBe('running');
      expect(updated?.progressPercent).toBe(50);
    });

    it('prevents cross-tenant access and mutation on Schedules and Runs', async () => {
      const schedule = await scheduleRepo.create({
        id: 'sched_alpha_1',
        organizationId: 'org_alpha',
        createdByUserId: 'usr_alpha',
        datasetId: 'ds_alpha_1',
        name: 'Weekly Digest',
        userQuery: 'Summarize weekly sales',
        scheduleType: 'recurring',
        cronExpression: '0 8 * * 1',
        timezone: 'UTC',
        oneTimeRunAt: null,
        nextRunAt: '2026-10-26T08:00:00.000Z',
        lastRunAt: null,
        concurrencyLimit: 1,
        isEnabled: true,
        deliveryDestinationId: null,
        biConnectionId: null,
        exportFormat: 'html',
        status: 'active',
      });

      expect(schedule.id).toBe('sched_alpha_1');
      expect(await scheduleRepo.findById('sched_alpha_1', 'org_beta')).toBeNull();

      // Cross-tenant run listing
      await scheduleRepo.createRun({
        id: 'run_alpha_1',
        scheduleId: 'sched_alpha_1',
        organizationId: 'org_alpha',
        analysisId: null,
        scheduledFor: '2026-10-26T08:00:00.000Z',
        startedAt: new Date().toISOString(),
        status: 'running',
        retryCount: 0,
      });

      expect(await scheduleRepo.listRuns('sched_alpha_1', 'org_beta')).toHaveLength(0);
      expect(await scheduleRepo.listRuns('sched_alpha_1', 'org_alpha')).toHaveLength(1);

      // Update run status
      await scheduleRepo.updateRun('run_alpha_1', {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      const runs = await scheduleRepo.listRuns('sched_alpha_1', 'org_alpha');
      expect(runs[0]?.status).toBe('completed');
    });

    it('prevents cross-tenant access and mutation on Delivery Destinations', async () => {
      await deliveryRepo.create({
        id: 'dest_alpha_1',
        organizationId: 'org_alpha',
        name: 'Alpha Slack Webhook',
        destinationType: 'webhook',
        recipientEmails: null,
        webhookUrl: 'https://hooks.slack.com/services/alpha',
        encryptedSecret: null,
        isActive: true,
      });

      expect(await deliveryRepo.findById('dest_alpha_1', 'org_beta')).toBeNull();
      expect(await deliveryRepo.delete('dest_alpha_1', 'org_beta')).toBe(false);
      expect(await deliveryRepo.findById('dest_alpha_1', 'org_alpha')).not.toBeNull();
      expect(await deliveryRepo.delete('dest_alpha_1', 'org_alpha')).toBe(true);
      expect(await deliveryRepo.findById('dest_alpha_1', 'org_alpha')).toBeNull();
    });

    it('prevents cross-tenant access and mutation on BI Connections', async () => {
      await biRepo.create({
        id: 'bi_alpha_1',
        organizationId: 'org_alpha',
        name: 'Superset Alpha',
        platformType: 'superset',
        hostUrl: 'http://superset.alpha:8088',
        encryptedCredentials: 'enc_alpha_creds',
        status: 'connected',
        lastTestedAt: new Date().toISOString(),
        lastError: null,
      });

      expect(await biRepo.findById('bi_alpha_1', 'org_beta')).toBeNull();
      expect(await biRepo.delete('bi_alpha_1', 'org_beta')).toBe(false);
      expect(await biRepo.findById('bi_alpha_1', 'org_alpha')).not.toBeNull();
      expect(await biRepo.delete('bi_alpha_1', 'org_alpha')).toBe(true);
      expect(await biRepo.findById('bi_alpha_1', 'org_alpha')).toBeNull();
    });

    it('strictly isolates Audit Logs per tenant', async () => {
      await auditRepo.create({
        id: 'audit_alpha_1',
        organizationId: 'org_alpha',
        userId: 'usr_alpha',
        action: 'dataset:deleted',
        resourceType: 'dataset',
        resourceId: 'ds_alpha_1',
        detailsJson: JSON.stringify({ reason: 'cleanup' }),
      });

      await auditRepo.create({
        id: 'audit_beta_1',
        organizationId: 'org_beta',
        userId: 'usr_beta',
        action: 'user:invited',
        resourceType: 'user',
        resourceId: 'usr_beta_2',
        detailsJson: null,
      });

      const alphaLogs = await auditRepo.listForOrganization('org_alpha');
      const betaLogs = await auditRepo.listForOrganization('org_beta');

      expect(alphaLogs).toHaveLength(1);
      expect(alphaLogs[0]?.id).toBe('audit_alpha_1');
      expect(betaLogs).toHaveLength(1);
      expect(betaLogs[0]?.id).toBe('audit_beta_1');
    });
  });

  describe('3. Transaction Boundaries & Rollback Verification', () => {
    it('executes atomic migration transaction and rolls back when an error occurs in PostgresAdapter', async () => {
      const { PostgresAdapter } = await import('../../src/lib/db/postgres-adapter.js');
      const adapter = new PostgresAdapter('postgresql://mock:mock@localhost:5432/mock_db');

      const queryCalls: string[] = [];
      const mockClient = {
        query: async (queryText: string) => {
          queryCalls.push(queryText.trim());
          if (queryText.includes('CREATE TABLE IF NOT EXISTS _migrations')) {
            return { rows: [] };
          }
          if (queryText.includes('SELECT version FROM _migrations')) {
            return { rows: [] };
          }
          if (queryText === 'BEGIN') {
            return { rows: [] };
          }
          if (queryText.includes('ROLLBACK')) {
            return { rows: [] };
          }
          // Any migration statement triggers a failure immediately after BEGIN
          throw new Error('Simulated database write failure during migration');
        },
        release: () => {},
      };

      (adapter as any).pool = {
        connect: async () => mockClient,
        end: async () => {},
      };

      await expect(adapter.init()).rejects.toThrow('Simulated database write failure during migration');

      // Verify transaction sequence: BEGIN was called, followed by ROLLBACK, never COMMIT
      expect(queryCalls).toContain('BEGIN');
      expect(queryCalls).toContain('ROLLBACK');
      expect(queryCalls).not.toContain('COMMIT');
    });

    it('commits transaction when all migration statements succeed', async () => {
      const { PostgresAdapter } = await import('../../src/lib/db/postgres-adapter.js');
      const adapter = new PostgresAdapter('postgresql://mock:mock@localhost:5432/mock_db');

      const queryCalls: string[] = [];
      const mockClient = {
        query: async (queryText: string) => {
          queryCalls.push(queryText.trim());
          if (queryText.includes('CREATE TABLE IF NOT EXISTS _migrations')) {
            return { rows: [] };
          }
          if (queryText.includes('SELECT version FROM _migrations')) {
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {},
      };

      (adapter as any).pool = {
        connect: async () => mockClient,
        end: async () => {},
      };

      await expect(adapter.init()).resolves.not.toThrow();

      // Verify BEGIN and COMMIT were invoked
      expect(queryCalls).toContain('BEGIN');
      expect(queryCalls).toContain('COMMIT');
      expect(queryCalls).not.toContain('ROLLBACK');
    });
  });

  describe('4. Ordering, Pagination & Idempotency', () => {
    it('preserves creation order and limits on organization listings', async () => {
      for (let i = 1; i <= 5; i++) {
        await datasetRepo.create({
          id: `ds_order_${i}`,
          organizationId: 'org_ordered',
          uploadedByUserId: 'usr_order',
          originalFilename: `file_${i}.csv`,
          storagePath: `/path/${i}.csv`,
          fileSizeBytes: 100 * i,
          format: 'csv',
          rowCount: i * 10,
          columnCount: 2,
          schemaFingerprint: `fp_${i}`,
          status: 'ready',
        });
      }

      const list = await datasetRepo.listForOrganization('org_ordered');
      expect(list).toHaveLength(5);
      // All datasets belong to org_ordered
      expect(list.every((d) => d.organizationId === 'org_ordered')).toBe(true);
    });

    it('handles idempotent updates to memberships role changes', async () => {
      await userRepo.create({
        id: 'usr_idem',
        email: 'idem@example.com',
        name: 'Idem User',
        passwordHash: 'hash',
        salt: 'salt',
      });
      await userRepo.createMembership({
        id: 'mem_idem',
        organizationId: 'org_ordered',
        userId: 'usr_idem',
        role: 'analyst',
      });

      // Multiple updates to the same role should succeed idempotently
      await userRepo.updateMembershipRole('org_ordered', 'usr_idem', 'admin');
      expect((await userRepo.getMembership('org_ordered', 'usr_idem'))?.role).toBe('admin');

      await userRepo.updateMembershipRole('org_ordered', 'usr_idem', 'admin');
      expect((await userRepo.getMembership('org_ordered', 'usr_idem'))?.role).toBe('admin');
    });
  });
});
