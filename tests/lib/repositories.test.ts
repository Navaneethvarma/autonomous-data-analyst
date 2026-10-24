import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { MemoryDbAdapter } from '../../src/lib/db/memory-adapter.js';
import { sanitizeConnectionString } from '../../src/lib/db/index.js';
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

describe('Domain Repositories & Tenant Scoping Architecture', () => {
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

  describe('OrganizationRepository & UserRepository', () => {
    it('creates organizations and finds by id and slug', async () => {
      const org = await orgRepo.create({
        id: 'org_test_1',
        name: 'Acme Corp',
        slug: 'acme-corp',
      });

      expect(org.id).toBe('org_test_1');
      expect(org.name).toBe('Acme Corp');

      const byId = await orgRepo.findById('org_test_1');
      expect(byId?.slug).toBe('acme-corp');

      const bySlug = await orgRepo.findBySlug('acme-corp');
      expect(bySlug?.id).toBe('org_test_1');

      const notFound = await orgRepo.findBySlug('nonexistent');
      expect(notFound).toBeNull();
    });

    it('creates users, manages memberships, and verifies unique lookups', async () => {
      const user = await userRepo.create({
        id: 'usr_1',
        email: 'alice@example.com',
        name: 'Alice Analyst',
        passwordHash: 'hash123',
        salt: 'salt123',
      });

      expect(user.id).toBe('usr_1');

      const byEmail = await userRepo.findByEmail('alice@example.com');
      expect(byEmail?.name).toBe('Alice Analyst');

      const mem = await userRepo.createMembership({
        id: 'mem_1',
        organizationId: 'org_test_1',
        userId: 'usr_1',
        role: 'admin',
      });
      expect(mem.role).toBe('admin');

      const lookup = await userRepo.getMembership('org_test_1', 'usr_1');
      expect(lookup?.role).toBe('admin');

      await userRepo.updateMembershipRole('org_test_1', 'usr_1', 'viewer');
      const updated = await userRepo.getMembership('org_test_1', 'usr_1');
      expect(updated?.role).toBe('viewer');

      const memberships = await userRepo.getMembershipsByUser('usr_1');
      expect(memberships).toHaveLength(1);
    });
  });

  describe('SessionRepository', () => {
    it('creates and manages session lifecycles and user revocation', async () => {
      const tokenHash = crypto.createHash('sha256').update('secret_tok_1').digest('hex');
      await sessionRepo.create({
        id: 'sess_1',
        tokenHash,
        userId: 'usr_1',
        organizationId: 'org_test_1',
        csrfToken: 'csrf_1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const found = await sessionRepo.findByTokenHash(tokenHash);
      expect(found?.userId).toBe('usr_1');

      await sessionRepo.delete(tokenHash);
      const afterDelete = await sessionRepo.findByTokenHash(tokenHash);
      expect(afterDelete).toBeNull();

      // Test user session batch revocation
      const tokenHash2 = crypto.createHash('sha256').update('secret_tok_2').digest('hex');
      await sessionRepo.create({
        id: 'sess_2',
        tokenHash: tokenHash2,
        userId: 'usr_1',
        organizationId: 'org_test_1',
        csrfToken: 'csrf_2',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await sessionRepo.deleteForUser('usr_1');
      expect(await sessionRepo.findByTokenHash(tokenHash2)).toBeNull();
    });
  });

  describe('DatasetRepository & Tenant Scoping', () => {
    it('enforces tenant isolation on dataset queries', async () => {
      await datasetRepo.create({
        id: 'ds_tenant_a',
        organizationId: 'org_alpha',
        uploadedByUserId: 'usr_1',
        originalFilename: 'sales.csv',
        storagePath: '/data/org_alpha/sales.csv',
        fileSizeBytes: 1024,
        format: 'csv',
        rowCount: 50,
        columnCount: 3,
        schemaFingerprint: 'fp_1',
        status: 'ready',
      });

      // Tenant Alpha lookup should succeed
      const alphaLookup = await datasetRepo.findById('ds_tenant_a', 'org_alpha');
      expect(alphaLookup).not.toBeNull();
      expect(alphaLookup?.originalFilename).toBe('sales.csv');

      // Cross-tenant lookup from Tenant Beta MUST return null
      const betaLookup = await datasetRepo.findById('ds_tenant_a', 'org_beta');
      expect(betaLookup).toBeNull();

      // List by org should strictly filter to target tenant
      const alphaList = await datasetRepo.listForOrganization('org_alpha');
      expect(alphaList).toHaveLength(1);
      const betaList = await datasetRepo.listForOrganization('org_beta');
      expect(betaList).toHaveLength(0);

      // Dataset profiles
      await datasetRepo.saveProfile({
        id: 'prof_1',
        datasetId: 'ds_tenant_a',
        profileJson: JSON.stringify({ rowCount: 50 }),
      });
      const prof = await datasetRepo.getProfile('ds_tenant_a');
      expect(prof?.profileJson).toContain('"rowCount":50');

      // Tenant-scoped deletion: wrong tenant cannot delete
      const wrongDelete = await datasetRepo.delete('ds_tenant_a', 'org_beta');
      expect(wrongDelete).toBe(false);
      expect(await datasetRepo.findById('ds_tenant_a', 'org_alpha')).not.toBeNull();

      // Correct tenant delete
      const rightDelete = await datasetRepo.delete('ds_tenant_a', 'org_alpha');
      expect(rightDelete).toBe(true);
      expect(await datasetRepo.findById('ds_tenant_a', 'org_alpha')).toBeNull();
    });
  });

  describe('AnalysisRepository & Artifact Scoping', () => {
    it('enforces tenant boundaries on analyses and artifacts', async () => {
      await analysisRepo.create({
        id: 'an_1',
        organizationId: 'org_alpha',
        userId: 'usr_1',
        datasetId: 'ds_1',
        userQuery: 'Total revenue by region',
        jobId: 'job_1',
        status: 'completed',
        stage: 'completed',
        progressPercent: 100,
        retryCount: 0,
      });

      // Tenant scoping check
      expect(await analysisRepo.findById('an_1', 'org_alpha')).not.toBeNull();
      expect(await analysisRepo.findById('an_1', 'org_beta')).toBeNull();

      // Artifact scoping
      await analysisRepo.createArtifact({
        id: 'art_1',
        organizationId: 'org_alpha',
        analysisId: 'an_1',
        artifactType: 'dashboard_spec',
        storagePath: 'db://spec',
        fileName: 'spec.json',
        mimeType: 'application/json',
        fileSizeBytes: 500,
      });

      const alphaArtifacts = await analysisRepo.listArtifacts('an_1', 'org_alpha');
      expect(alphaArtifacts).toHaveLength(1);

      const betaArtifacts = await analysisRepo.listArtifacts('an_1', 'org_beta');
      expect(betaArtifacts).toHaveLength(0);
    });
  });

  describe('ScheduleRepository, DeliveryRepository, and BiRepository', () => {
    it('enforces tenant boundary on schedules, delivery destinations, and BI platforms', async () => {
      // Schedule
      const sched = await scheduleRepo.create({
        id: 'sched_1',
        organizationId: 'org_alpha',
        createdByUserId: 'usr_1',
        datasetId: 'ds_1',
        name: 'Daily Revenue',
        userQuery: 'Compute revenue',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        oneTimeRunAt: null,
        nextRunAt: '2026-10-20T09:00:00.000Z',
        lastRunAt: null,
        concurrencyLimit: 2,
        isEnabled: true,
        deliveryDestinationId: null,
        biConnectionId: null,
        exportFormat: 'html',
        status: 'active',
      });

      expect(sched.name).toBe('Daily Revenue');
      expect(await scheduleRepo.findById('sched_1', 'org_alpha')).not.toBeNull();
      expect(await scheduleRepo.findById('sched_1', 'org_beta')).toBeNull();

      // Due schedules
      const due = await scheduleRepo.listDue('2026-10-21T00:00:00.000Z');
      expect(due).toHaveLength(1);

      // Schedule runs
      await scheduleRepo.createRun({
        id: 'run_1',
        scheduleId: 'sched_1',
        organizationId: 'org_alpha',
        analysisId: 'an_1',
        scheduledFor: '2026-10-20T09:00:00.000Z',
        startedAt: new Date().toISOString(),
        status: 'running',
        retryCount: 0,
      });

      const runsAlpha = await scheduleRepo.listRuns('sched_1', 'org_alpha');
      expect(runsAlpha).toHaveLength(1);
      const runsBeta = await scheduleRepo.listRuns('sched_1', 'org_beta');
      expect(runsBeta).toHaveLength(0);

      expect(await scheduleRepo.getActiveRunCount('sched_1')).toBe(1);

      // Delivery Destination
      await deliveryRepo.create({
        id: 'dest_1',
        organizationId: 'org_alpha',
        name: 'Slack Webhook',
        destinationType: 'webhook',
        recipientEmails: null,
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00',
        encryptedSecret: null,
        isActive: true,
      });

      expect(await deliveryRepo.findById('dest_1', 'org_alpha')).not.toBeNull();
      expect(await deliveryRepo.findById('dest_1', 'org_beta')).toBeNull();

      // BI Connection
      await biRepo.create({
        id: 'biconn_1',
        organizationId: 'org_alpha',
        name: 'Superset Prod',
        platformType: 'superset',
        hostUrl: 'http://superset.internal:8088',
        encryptedCredentials: 'enc_creds_test',
        status: 'untested',
        lastTestedAt: null,
        lastError: null,
      });

      expect(await biRepo.findById('biconn_1', 'org_alpha')).not.toBeNull();
      expect(await biRepo.findById('biconn_1', 'org_beta')).toBeNull();
    });
  });

  describe('AuditRepository & Sanitization', () => {
    it('creates audit logs and retrieves them scoped to organization', async () => {
      await auditRepo.create({
        id: 'audit_1',
        organizationId: 'org_alpha',
        userId: 'usr_1',
        action: 'dataset:uploaded',
        resourceType: 'dataset',
        resourceId: 'ds_1',
        detailsJson: JSON.stringify({ filename: 'test.csv' }),
      });

      const alphaLogs = await auditRepo.listForOrganization('org_alpha');
      expect(alphaLogs).toHaveLength(1);
      expect(alphaLogs[0]?.action).toBe('dataset:uploaded');

      const betaLogs = await auditRepo.listForOrganization('org_beta');
      expect(betaLogs).toHaveLength(0);
    });

    it('sanitizeConnectionString masks passwords in connection strings', () => {
      const sanitized = sanitizeConnectionString('postgres://ada_user:super_secret_pw@localhost:5432/ada_db');
      expect(sanitized).toBe('postgres://ada_user:***@localhost:5432/ada_db');
      expect(sanitized).not.toContain('super_secret_pw');
    });
  });
});
