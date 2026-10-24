import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../db/types.js';
import {
  ScheduleRepository,
  type IScheduleRepository,
  DatasetRepository,
  type IDatasetRepository,
  AnalysisRepository,
  type IAnalysisRepository,
  AuditRepository,
  type IAuditRepository,
} from '../db/repositories/index.js';
import { AnalysisQueueAdapter } from '../queue/analysis-queue.js';
import { ScheduleRecord } from '../db/types.js';
import { TimezoneScheduler } from './timezone.js';
import { DeliveryService } from '../delivery/service.js';
import { BiIntegrationService } from '../bi/service.js';
import { redactSensitiveData } from '../security/encryption.js';

export interface SchedulerDaemonOptions {
  pollIntervalMs?: number;
  gracePeriodMs?: number;
  maxMissedRunsToReconcile?: number;
}

export interface SchedulerDaemonRepositories {
  scheduleRepo: IScheduleRepository;
  datasetRepo: IDatasetRepository;
  analysisRepo: IAnalysisRepository;
  auditRepo: IAuditRepository;
  deliveryService?: DeliveryService;
  biService?: BiIntegrationService;
}

export class SchedulerDaemon {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private scheduleRepo: IScheduleRepository;
  private datasetRepo: IDatasetRepository;
  private analysisRepo: IAnalysisRepository;
  private auditRepo: IAuditRepository;
  private deliveryService: DeliveryService;
  private biService: BiIntegrationService;
  private inFlightDispatches = new Set<string>(); // In-process lock token per scheduleId

  constructor(
    dbOrRepos: DatabaseAdapter | SchedulerDaemonRepositories,
    private queue: AnalysisQueueAdapter,
    private options: SchedulerDaemonOptions = {}
  ) {
    if ('createSchedule' in dbOrRepos && 'getScheduleById' in dbOrRepos) {
      const db = dbOrRepos as DatabaseAdapter;
      this.scheduleRepo = new ScheduleRepository(db);
      this.datasetRepo = new DatasetRepository(db);
      this.analysisRepo = new AnalysisRepository(db);
      this.auditRepo = new AuditRepository(db);
      this.deliveryService = new DeliveryService(db);
      this.biService = new BiIntegrationService(db);
    } else {
      const repos = dbOrRepos as SchedulerDaemonRepositories;
      this.scheduleRepo = repos.scheduleRepo;
      this.datasetRepo = repos.datasetRepo;
      this.analysisRepo = repos.analysisRepo;
      this.auditRepo = repos.auditRepo;
      this.deliveryService = repos.deliveryService || new DeliveryService({
        deliveryRepo: repos.scheduleRepo as any,
        scheduleRepo: repos.scheduleRepo,
        analysisRepo: repos.analysisRepo,
        auditRepo: repos.auditRepo,
      } as any);
      this.biService = repos.biService || new BiIntegrationService({
        biRepo: repos.scheduleRepo as any,
        auditRepo: repos.auditRepo,
        analysisRepo: repos.analysisRepo,
        scheduleRepo: repos.scheduleRepo,
      } as any);
    }
  }

  /**
   * Starts the periodic scheduling polling daemon.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs || 10000;

    // Run reconciliation for any missed schedules during downtime
    this.reconcileMissedRuns().catch(() => {});

    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('Scheduler daemon tick error:', redactSensitiveData(err.message));
      });
    }, interval);
  }

  /**
   * Stops the scheduling polling daemon.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.inFlightDispatches.clear();
  }

  /**
   * Evaluates due schedules at the current or specified timestamp.
   * Dispatches due jobs idempotently with concurrency protection.
   */
  async tick(nowIso?: string): Promise<{ dispatchedCount: number; skippedCount: number }> {
    const currentTime = nowIso ? new Date(nowIso) : new Date();
    const currentIso = currentTime.toISOString();

    const dueSchedules = await this.scheduleRepo.listDue(currentIso);
    let dispatchedCount = 0;
    let skippedCount = 0;

    for (const schedule of dueSchedules) {
      const dispatched = await this.dispatchSchedule(schedule, currentIso);
      if (dispatched) {
        dispatchedCount++;
      } else {
        skippedCount++;
      }
    }

    return { dispatchedCount, skippedCount };
  }

  /**
   * Reconciles missed schedules following an application restart or worker downtime.
   */
  async reconcileMissedRuns(nowIso?: string): Promise<number> {
    const now = nowIso ? new Date(nowIso) : new Date();
    const graceMs = this.options.gracePeriodMs || 60000; // 1 minute default grace period
    const overdueCutoff = new Date(now.getTime() - graceMs).toISOString();

    const overdueSchedules = await this.scheduleRepo.listDue(overdueCutoff);
    let reconciledCount = 0;

    for (const schedule of overdueSchedules) {
      // 1. Advance nextRunAt immediately to the next future occurrence to prevent cascade storms
      let updatedNextRun: string | null = null;
      if (schedule.scheduleType === 'recurring' && schedule.cronExpression) {
        try {
          updatedNextRun = TimezoneScheduler.getNextRun(
            schedule.cronExpression,
            schedule.timezone,
            now
          );
        } catch {
          updatedNextRun = null;
        }
      }

      await this.scheduleRepo.update(schedule.id, {
        nextRunAt: updatedNextRun,
        status: updatedNextRun ? 'active' : 'completed',
        isEnabled: updatedNextRun !== null,
      });

      await this.auditRepo.create({
        id: `audit_${crypto.randomUUID()}`,
        organizationId: schedule.organizationId,
        action: 'schedule:missed_run_reconciled',
        resourceType: 'schedule',
        resourceId: schedule.id,
        detailsJson: JSON.stringify({
          originalScheduled: schedule.nextRunAt,
          advancedTo: updatedNextRun,
          reconciledAt: now.toISOString(),
        }),
      });

      // 2. Dispatch a single catch-up run for this overdue schedule
      const dispatched = await this.executeScheduleRun(schedule, schedule.nextRunAt || now.toISOString());
      if (dispatched) {
        reconciledCount++;
      }
    }

    return reconciledCount;
  }

  /**
   * Dispatches a single schedule run, enforcing concurrency limits and updating nextRunAt.
   */
  async dispatchSchedule(schedule: ScheduleRecord, scheduledFor: string): Promise<boolean> {
    // In-process lock to prevent duplicate dispatch during concurrent ticks
    if (this.inFlightDispatches.has(schedule.id)) {
      return false;
    }
    this.inFlightDispatches.add(schedule.id);

    try {
      // 1. Concurrency limit check: protect against overlapping executions
      const activeCount = await this.scheduleRepo.getActiveRunCount(schedule.id);
      if (activeCount >= schedule.concurrencyLimit) {
        // Concurrency limit reached: skip dispatch this tick
        return false;
      }

      // 2. Advance nextRunAt immediately before queue submission to prevent race conditions
      let nextRunAt: string | null = null;
      let newStatus = schedule.status;
      let isEnabled = schedule.isEnabled;

      if (schedule.scheduleType === 'recurring' && schedule.cronExpression) {
        nextRunAt = TimezoneScheduler.getNextRun(
          schedule.cronExpression,
          schedule.timezone,
          new Date(scheduledFor)
        );
      } else if (schedule.scheduleType === 'one_time') {
        nextRunAt = null;
        newStatus = 'completed';
        isEnabled = false;
      }

      await this.scheduleRepo.update(schedule.id, {
        nextRunAt,
        lastRunAt: scheduledFor,
        status: newStatus,
        isEnabled,
      });

      // 3. Execute the schedule run
      return await this.executeScheduleRun(schedule, scheduledFor);
    } finally {
      this.inFlightDispatches.delete(schedule.id);
    }
  }

  /**
   * Submits an analysis job to the queue and records the schedule run.
   */
  private async executeScheduleRun(schedule: ScheduleRecord, scheduledFor: string): Promise<boolean> {
    const dataset = await this.datasetRepo.findById(schedule.datasetId, schedule.organizationId);
    if (!dataset) {
      // Dataset deleted or unauthorized
      await this.scheduleRepo.update(schedule.id, { status: 'failed', isEnabled: false });
      return false;
    }

    const runId = `run_${crypto.randomUUID()}`;
    const analysisId = `analysis_${crypto.randomUUID()}`;
    const jobId = `job_${crypto.randomUUID()}`;

    // 1. Create Analysis record
    await this.analysisRepo.create({
      id: analysisId,
      organizationId: schedule.organizationId,
      userId: schedule.createdByUserId,
      datasetId: schedule.datasetId,
      userQuery: schedule.userQuery,
      jobId,
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
      retryCount: 0,
    });

    // 2. Create Schedule Run record
    await this.scheduleRepo.createRun({
      id: runId,
      scheduleId: schedule.id,
      organizationId: schedule.organizationId,
      analysisId,
      scheduledFor,
      startedAt: new Date().toISOString(),
      status: 'running',
      retryCount: 0,
    });

    // 3. Submit background job to Queue
    try {
      await this.queue.submitJob({
        analysisId,
        organizationId: schedule.organizationId,
        userId: schedule.createdByUserId,
        datasetId: schedule.datasetId,
        datasetPath: dataset.storagePath,
        userQuery: schedule.userQuery,
      });

      // 4. Hook post-execution actions asynchronously
      this.monitorAndDeliver(schedule, runId, analysisId).catch(() => {});
      return true;
    } catch (err: any) {
      await this.scheduleRepo.updateRun(runId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: redactSensitiveData(err.message || 'Failed to submit analysis job'),
      });
      return false;
    }
  }

  /**
   * Monitors analysis completion and triggers delivery and BI export integrations.
   */
  async monitorAndDeliver(
    schedule: ScheduleRecord,
    scheduleRunId: string,
    analysisId: string,
    maxWaitMs = 120000,
    pollIntervalMs = 500
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const analysis = await this.analysisRepo.findById(analysisId, schedule.organizationId);
      if (!analysis) break;

      if (analysis.status === 'completed') {
        // 1. Post-Analysis Delivery Hook
        if (schedule.deliveryDestinationId) {
          try {
            await this.deliveryService.dispatchDelivery({
              scheduleId: schedule.id,
              scheduleRunId,
              analysisId,
              organizationId: schedule.organizationId,
              destinationId: schedule.deliveryDestinationId,
            });
          } catch {
            // Error recorded inside dispatchDelivery
          }
        }

        // 2. Post-Analysis BI Export Hook
        if (schedule.biConnectionId) {
          try {
            await this.biService.exportAnalysis({
              connectionId: schedule.biConnectionId,
              organizationId: schedule.organizationId,
              analysisId,
              scheduleRunId,
            });
          } catch {
            // Error recorded inside exportAnalysis
          }
        }

        // 3. Mark schedule run completed
        await this.scheduleRepo.updateRun(scheduleRunId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        return;
      }

      if (analysis.status === 'failed' || analysis.status === 'cancelled') {
        await this.scheduleRepo.updateRun(scheduleRunId, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          errorMessage: analysis.errorMessage || 'Analysis execution failed',
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
}
