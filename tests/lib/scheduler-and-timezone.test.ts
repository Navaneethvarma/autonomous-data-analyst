import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { InMemoryAnalysisQueue } from '../../src/lib/queue/analysis-queue.js';
import { TimezoneScheduler } from '../../src/lib/scheduler/timezone.js';
import { ScheduleService } from '../../src/lib/scheduler/service.js';
import { SchedulerDaemon } from '../../src/lib/scheduler/daemon.js';
import { AuthorizationError } from '../../src/lib/auth/rbac.js';

describe('Timezone, Cron, and DST Calculations (Milestone 12)', () => {
  it('validates IANA timezones and detects invalid ones', () => {
    expect(TimezoneScheduler.isValidTimezone('UTC')).toBe(true);
    expect(TimezoneScheduler.isValidTimezone('America/New_York')).toBe(true);
    expect(TimezoneScheduler.isValidTimezone('Europe/London')).toBe(true);
    expect(TimezoneScheduler.isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(TimezoneScheduler.isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(TimezoneScheduler.isValidTimezone('')).toBe(false);
  });

  it('validates 5-field cron expressions', () => {
    expect(TimezoneScheduler.isValidCronExpression('0 9 * * 1', 'UTC')).toBe(true); // Monday 9am
    expect(TimezoneScheduler.isValidCronExpression('*/15 * * * *', 'UTC')).toBe(true); // Every 15 min
    expect(TimezoneScheduler.isValidCronExpression('invalid cron', 'UTC')).toBe(false);
    expect(TimezoneScheduler.isValidCronExpression('0 9 * *', 'UTC')).toBe(false); // Only 4 fields
  });

  it('handles US Eastern DST Spring-Forward (clocks move forward 1 hour in March)', () => {
    // In America/New_York, DST springs forward on second Sunday in March (e.g. 2026-03-08 at 2:00 AM becomes 3:00 AM)
    // A daily 2:30 AM cron expression should safely compute the next occurrence
    const refDate = new Date('2026-03-07T12:00:00Z');
    const nextRunIso = TimezoneScheduler.getNextRun('30 2 * * *', 'America/New_York', refDate);
    expect(nextRunIso).toBeDefined();

    const nextDate = new Date(nextRunIso);
    expect(nextDate.getTime()).toBeGreaterThan(refDate.getTime());
  });

  it('handles US Eastern DST Fall-Back (clocks move backward 1 hour in November)', () => {
    // In America/New_York, DST ends on first Sunday in November (e.g. 2026-11-01 at 2:00 AM repeats)
    const refDate = new Date('2026-10-31T12:00:00Z');
    const nextRunIso = TimezoneScheduler.getNextRun('0 9 * * *', 'America/New_York', refDate);
    expect(nextRunIso).toBeDefined();

    const nextDate = new Date(nextRunIso);
    expect(nextDate.getTime()).toBeGreaterThan(refDate.getTime());
  });

  it('computes predictable next occurrences for daily recurring schedules in UTC', () => {
    const refDate = new Date('2026-10-19T00:00:00.000Z');
    const nextRun = TimezoneScheduler.getNextRun('0 8 * * *', 'UTC', refDate);
    expect(nextRun).toBe('2026-10-19T08:00:00.000Z');

    const nextNextRun = TimezoneScheduler.getNextRun('0 8 * * *', 'UTC', nextRun);
    expect(nextNextRun).toBe('2026-10-20T08:00:00.000Z');
  });
});

describe('Schedule Service & Multi-Tenant RBAC (Milestone 12)', () => {
  let db: MemoryDbAdapter;
  let scheduleService: ScheduleService;
  const orgA = 'org_tenant_a';
  const orgB = 'org_tenant_b';
  const userA = 'user_analyst_a';
  const datasetA = 'dataset_sales_a';

  beforeEach(async () => {
    db = new MemoryDbAdapter();
    await db.init();
    scheduleService = new ScheduleService(db);

    // Seed organizations
    await db.createOrganization({ id: orgA, name: 'Tenant A', slug: 'tenant-a' });
    await db.createOrganization({ id: orgB, name: 'Tenant B', slug: 'tenant-b' });

    // Seed dataset for Org A
    await db.createDataset({
      id: datasetA,
      organizationId: orgA,
      uploadedByUserId: userA,
      originalFilename: 'sales.csv',
      storagePath: 'datasets/sales.csv',
      fileSizeBytes: 1024,
      format: 'csv',
      rowCount: 100,
      columnCount: 5,
      schemaFingerprint: 'fp_sales',
      status: 'ready',
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates recurring schedule with validated cron, timezone, and dataset ownership', async () => {
    const schedule = await scheduleService.createSchedule({
      organizationId: orgA,
      userId: userA,
      datasetId: datasetA,
      name: 'Weekly Revenue Report',
      userQuery: 'What was total revenue by region last week?',
      scheduleType: 'recurring',
      cronExpression: '0 9 * * 1', // Every Monday at 9am
      timezone: 'America/New_York',
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.organizationId).toBe(orgA);
    expect(schedule.name).toBe('Weekly Revenue Report');
    expect(schedule.scheduleType).toBe('recurring');
    expect(schedule.nextRunAt).toBeDefined();
    expect(schedule.status).toBe('active');
  });

  it('rejects schedule creation referencing dataset belonging to another tenant', async () => {
    await expect(
      scheduleService.createSchedule({
        organizationId: orgB, // Org B tries to use Org A's dataset
        userId: 'user_b',
        datasetId: datasetA,
        name: 'Unauthorized Schedule',
        userQuery: 'Show me data',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('prevents cross-tenant schedule modification or deletion (anti-IDOR)', async () => {
    const schedule = await scheduleService.createSchedule({
      organizationId: orgA,
      userId: userA,
      datasetId: datasetA,
      name: 'Tenant A Schedule',
      userQuery: 'Analyze sales',
      scheduleType: 'recurring',
      cronExpression: '0 12 * * *',
    });

    // Tenant B attempts to update Tenant A's schedule
    await expect(
      scheduleService.updateSchedule(schedule.id, orgB, 'user_b', { name: 'Hacked Name' })
    ).rejects.toThrow(AuthorizationError);

    // Tenant B attempts to delete Tenant A's schedule
    await expect(
      scheduleService.deleteSchedule(schedule.id, orgB, 'user_b')
    ).rejects.toThrow(AuthorizationError);

    // Tenant B attempts to list Tenant A's runs
    await expect(
      scheduleService.listScheduleRuns(schedule.id, orgB)
    ).rejects.toThrow(AuthorizationError);
  });

  it('supports editing and disabling schedules', async () => {
    const schedule = await scheduleService.createSchedule({
      organizationId: orgA,
      userId: userA,
      datasetId: datasetA,
      name: 'Original Schedule',
      userQuery: 'Compute totals',
      scheduleType: 'recurring',
      cronExpression: '0 6 * * *',
    });

    const updated = await scheduleService.updateSchedule(schedule.id, orgA, userA, {
      name: 'Renamed Schedule',
      isEnabled: false,
    });

    expect(updated.name).toBe('Renamed Schedule');
    expect(updated.isEnabled).toBe(false);
    expect(updated.status).toBe('paused');
  });
});

describe('Scheduler Daemon, Concurrency Limits & Restart Recovery (Milestone 12)', () => {
  let db: MemoryDbAdapter;
  let queue: InMemoryAnalysisQueue;
  let daemon: SchedulerDaemon;
  const orgId = 'org_daemon_test';
  const userId = 'user_daemon_test';
  const datasetId = 'dataset_daemon_test';

  beforeEach(async () => {
    db = new MemoryDbAdapter();
    await db.init();
    queue = new InMemoryAnalysisQueue(db);
    daemon = new SchedulerDaemon(db, queue, { gracePeriodMs: 5000 });

    await db.createOrganization({ id: orgId, name: 'Daemon Org', slug: 'daemon-org' });
    await db.createDataset({
      id: datasetId,
      organizationId: orgId,
      uploadedByUserId: userId,
      originalFilename: 'test.csv',
      storagePath: 'datasets/test.csv',
      fileSizeBytes: 100,
      format: 'csv',
      rowCount: 10,
      columnCount: 2,
      schemaFingerprint: 'fp_test',
      status: 'ready',
    });
  });

  afterEach(async () => {
    daemon.stop();
    await queue.close();
    await db.close();
  });

  it('dispatches due schedule and advances nextRunAt immediately', async () => {
    const now = new Date('2026-10-19T10:00:00.000Z');
    const pastRun = new Date('2026-10-19T09:00:00.000Z').toISOString();

    const schedule = await db.createSchedule({
      id: 'sched_due_1',
      organizationId: orgId,
      createdByUserId: userId,
      datasetId,
      name: 'Hourly Check',
      userQuery: 'Calculate volume',
      scheduleType: 'recurring',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      nextRunAt: pastRun, // Due in the past
      lastRunAt: null,
      concurrencyLimit: 1,
      isEnabled: true,
      exportFormat: 'html',
      status: 'active',
    });

    const result = await daemon.tick(now.toISOString());
    expect(result.dispatchedCount).toBe(1);

    // Verify nextRunAt was advanced
    const updatedSchedule = await db.getScheduleById(schedule.id, orgId);
    expect(updatedSchedule?.nextRunAt).not.toBe(pastRun);
    expect(new Date(updatedSchedule!.nextRunAt!).getTime()).toBeGreaterThan(new Date(pastRun).getTime());

    // Verify schedule_run record was created
    const runs = await db.listScheduleRuns(schedule.id, orgId);
    expect(runs.length).toBe(1);
    expect(runs[0]!.status).toBe('running');
  });

  it('prevents duplicate dispatch when concurrent ticks fire simultaneously (idempotency)', async () => {
    const now = new Date('2026-10-19T10:00:00.000Z');
    const pastRun = new Date('2026-10-19T09:00:00.000Z').toISOString();

    await db.createSchedule({
      id: 'sched_dup_test',
      organizationId: orgId,
      createdByUserId: userId,
      datasetId,
      name: 'Idempotent Hourly Job',
      userQuery: 'Run job',
      scheduleType: 'recurring',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      nextRunAt: pastRun,
      lastRunAt: null,
      concurrencyLimit: 1,
      isEnabled: true,
      exportFormat: 'html',
      status: 'active',
    });

    // Simulate two concurrent pollers triggering tick() simultaneously
    const [tick1, tick2] = await Promise.all([
      daemon.tick(now.toISOString()),
      daemon.tick(now.toISOString()),
    ]);

    // Only one should have dispatched the job!
    expect(tick1.dispatchedCount + tick2.dispatchedCount).toBe(1);
  });

  it('enforces concurrency limit and prevents overlapping runs when previous run is still active', async () => {
    const now = new Date('2026-10-19T10:00:00.000Z');
    const pastRun = new Date('2026-10-19T09:00:00.000Z').toISOString();

    const schedule = await db.createSchedule({
      id: 'sched_concurrency_test',
      organizationId: orgId,
      createdByUserId: userId,
      datasetId,
      name: 'Long Running Schedule',
      userQuery: 'Long analysis',
      scheduleType: 'recurring',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      nextRunAt: pastRun,
      lastRunAt: null,
      concurrencyLimit: 1, // Max 1 concurrent run allowed
      isEnabled: true,
      exportFormat: 'html',
      status: 'active',
    });

    // Simulate an active run in progress
    await db.createScheduleRun({
      id: 'run_active_1',
      scheduleId: schedule.id,
      organizationId: orgId,
      scheduledFor: pastRun,
      startedAt: new Date().toISOString(),
      status: 'running',
      retryCount: 0,
    });

    // Tick should skip dispatch because activeCount (1) >= concurrencyLimit (1)
    const result = await daemon.tick(now.toISOString());
    expect(result.dispatchedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('recovers from server restart/downtime by reconciling overdue runs and advancing nextRunAt', async () => {
    const now = new Date('2026-10-19T14:00:00.000Z');
    // Schedule missed 4 hours ago during outage
    const overdueTime = new Date('2026-10-19T10:00:00.000Z').toISOString();

    const schedule = await db.createSchedule({
      id: 'sched_missed_recovery',
      organizationId: orgId,
      createdByUserId: userId,
      datasetId,
      name: 'Missed During Downtime',
      userQuery: 'Catch up query',
      scheduleType: 'recurring',
      cronExpression: '0 * * * *', // hourly
      timezone: 'UTC',
      nextRunAt: overdueTime,
      lastRunAt: null,
      concurrencyLimit: 1,
      isEnabled: true,
      exportFormat: 'html',
      status: 'active',
    });

    // Reconcile missed runs
    const reconciled = await daemon.reconcileMissedRuns(now.toISOString());
    expect(reconciled).toBe(1);

    // Verify schedule was advanced to next occurrence without storming backlog
    const updated = await db.getScheduleById(schedule.id, orgId);
    expect(new Date(updated!.nextRunAt!).getTime()).toBeGreaterThan(now.getTime());

    // Verify audit record was created for missed run reconciliation
    const auditLogs = await db.listAuditLogsByOrg(orgId);
    const missedLog = auditLogs.find(l => l.action === 'schedule:missed_run_reconciled');
    expect(missedLog).toBeDefined();
  });
});
