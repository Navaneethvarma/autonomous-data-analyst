import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import type { DatabaseAdapter } from '../db/types.js';
import {
  AnalysisRepository,
  type IAnalysisRepository,
  DatasetRepository,
  type IDatasetRepository,
} from '../db/repositories/index.js';
import { AnalysisRecord } from '../db/types.js';
import { AnalyticalWorkflowOrchestrator, isTransientError } from '../workflow/orchestrator.js';
import { WorkflowResult } from '../workflow/types.js';
import { assertTenantScope, AuthorizationError } from '../auth/rbac.js';

import type {
  AnalysisJobPayload,
  AnalysisQueueAdapter,
} from '../../types/analysis.types.js';

export type { AnalysisJobPayload, AnalysisQueueAdapter };

export interface AnalysisQueueRepositories {
  analysisRepo: IAnalysisRepository;
  datasetRepo: IDatasetRepository;
}

export function resolveQueueRepos(dbOrRepos: DatabaseAdapter | AnalysisQueueRepositories): AnalysisQueueRepositories {
  if ('createAnalysis' in dbOrRepos && 'getDatasetById' in dbOrRepos) {
    const db = dbOrRepos as DatabaseAdapter;
    return {
      analysisRepo: new AnalysisRepository(db),
      datasetRepo: new DatasetRepository(db),
    };
  }
  return dbOrRepos as AnalysisQueueRepositories;
}

/**
 * Worker runner that processes a single analysis job, updating DB state and saving artifacts.
 * Independently resolves dataset from DB and validates tenant scope before opening files.
 */
export async function processAnalysisJob(
  dbOrRepos: DatabaseAdapter | AnalysisQueueRepositories,
  payload: AnalysisJobPayload,
  signal?: AbortSignal,
  onProgress?: (stage: string, percent: number, message: string) => void
): Promise<WorkflowResult> {
  const { analysisRepo, datasetRepo } = resolveQueueRepos(dbOrRepos);

  // Check if job was already cancelled before execution began
  const initialCheck = await analysisRepo.findById(payload.analysisId, payload.organizationId);
  if (initialCheck && (initialCheck.status === 'cancelled' || signal?.aborted)) {
    throw new Error('Analysis job was cancelled before execution started.');
  }

  // 1. Worker independent dataset verification & tenant authorization
  const dataset = await datasetRepo.findById(payload.datasetId, payload.organizationId);
  if (!dataset) {
    const errorMsg = `Dataset authorization error: dataset '${payload.datasetId}' is unauthorized or does not exist for tenant '${payload.organizationId}'.`;
    await analysisRepo.update(payload.analysisId, {
      status: 'failed',
      stage: 'failed',
      errorMessage: errorMsg,
      errorCategory: 'data_access',
    });
    throw new AuthorizationError(errorMsg);
  }
  assertTenantScope(payload.organizationId, dataset.organizationId, 'Dataset');

  // Verify dataset storage path boundary and avoid symlink traversal
  const safeDatasetPath = dataset.storagePath;
  const allowedDatasetBase = path.resolve(process.cwd(), 'datasets');
  const resolvedPath = path.isAbsolute(safeDatasetPath)
    ? path.resolve(safeDatasetPath)
    : (safeDatasetPath.startsWith('datasets')
        ? path.resolve(process.cwd(), safeDatasetPath)
        : path.resolve(allowedDatasetBase, safeDatasetPath));

  const relPath = path.relative(allowedDatasetBase, resolvedPath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
    const errorMsg = 'Dataset storage path escapes authorized tenant dataset boundary.';
    await analysisRepo.update(payload.analysisId, {
      status: 'failed',
      stage: 'failed',
      errorMessage: errorMsg,
      errorCategory: 'data_access',
    });
    throw new AuthorizationError(errorMsg);
  }

  if (!fs.existsSync(resolvedPath)) {
    const errorMsg = `Dataset file not found at authorized path.`;
    await analysisRepo.update(payload.analysisId, {
      status: 'failed',
      stage: 'failed',
      errorMessage: errorMsg,
      errorCategory: 'data_access',
    });
    throw new Error(errorMsg);
  }

  const orchestrator = new AnalyticalWorkflowOrchestrator();

  await analysisRepo.update(payload.analysisId, {
    status: 'running',
    stage: 'inspection',
    progressPercent: 10,
  });

  const result = await orchestrator.executeWorkflow(
    {
      userQuery: payload.userQuery,
      datasetPath: resolvedPath,
      generateArtifacts: {
        dashboard: true,
        report: true,
        reportTitle: `Analysis: ${payload.userQuery}`,
      },
      retryPolicy: {
        maxRetries: 2,
        timeoutMs: 30000,
      },
    },
    {
      signal,
      onProgress: async (stage, percent, message) => {
        try {
          await analysisRepo.update(payload.analysisId, {
            stage,
            progressPercent: percent,
          });
        } catch {
          // ignore db update error during progress report
        }
        if (onProgress) {
          onProgress(stage, percent, message);
        }
      },
    }
  );

  // Cancellation race check: do not overwrite cancelled status if cancelled concurrently
  const finalCheck = await analysisRepo.findById(payload.analysisId, payload.organizationId);
  if (finalCheck && finalCheck.status === 'cancelled') {
    return result;
  }

  // Determine final record status
  let finalStatus: AnalysisRecord['status'] = 'completed';
  if (result.status === 'terminal_failure' || result.status === 'execution_error') {
    finalStatus = 'failed';
  } else if (result.status === 'partial_success_artifact_failed') {
    finalStatus = 'partial_success';
  }

  // Update Analysis Record
  await analysisRepo.update(payload.analysisId, {
    status: finalStatus,
    stage: 'completed',
    progressPercent: 100,
    executionResultJson: result.executionResult ? JSON.stringify(result.executionResult) : null,
    validationResultJson: result.validationResult ? JSON.stringify(result.validationResult) : null,
    insightsJson: result.insights.length > 0 ? JSON.stringify(result.insights) : null,
    dashboardSpecJson: result.generatedArtifacts.dashboardSpec
      ? JSON.stringify(result.generatedArtifacts.dashboardSpec)
      : null,
    clarificationQuestion: result.clarificationQuestion,
    finalExplanation: result.finalExplanation,
    errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
    traceId: result.traceId,
    runId: result.runId,
  });

  // Reprocessing check: deduplicate existing artifacts for this analysis
  const existingArtifacts = await analysisRepo.listArtifacts(payload.analysisId, payload.organizationId);
  const existingTypes = new Set(existingArtifacts.map(a => a.artifactType));

  // Save generated artifacts to DB
  if (result.generatedArtifacts.dashboardSpec && !existingTypes.has('dashboard_spec')) {
    await analysisRepo.createArtifact({
      id: crypto.randomUUID(),
      organizationId: payload.organizationId,
      analysisId: payload.analysisId,
      artifactType: 'dashboard_spec',
      storagePath: `db://analyses/${payload.analysisId}/dashboard_spec`,
      fileName: 'dashboard_spec.json',
      mimeType: 'application/json',
      fileSizeBytes: JSON.stringify(result.generatedArtifacts.dashboardSpec).length,
    });
  }

  if (
    result.generatedArtifacts.reportHtmlPath &&
    fs.existsSync(result.generatedArtifacts.reportHtmlPath) &&
    !existingTypes.has('report_html')
  ) {
    const stats = fs.statSync(result.generatedArtifacts.reportHtmlPath);
    await analysisRepo.createArtifact({
      id: crypto.randomUUID(),
      organizationId: payload.organizationId,
      analysisId: payload.analysisId,
      artifactType: 'report_html',
      storagePath: result.generatedArtifacts.reportHtmlPath,
      fileName: path.basename(result.generatedArtifacts.reportHtmlPath),
      mimeType: 'text/html',
      fileSizeBytes: stats.size,
    });
  }

  if (
    result.generatedArtifacts.reportPdfPath &&
    fs.existsSync(result.generatedArtifacts.reportPdfPath) &&
    !existingTypes.has('report_pdf')
  ) {
    const stats = fs.statSync(result.generatedArtifacts.reportPdfPath);
    await analysisRepo.createArtifact({
      id: crypto.randomUUID(),
      organizationId: payload.organizationId,
      analysisId: payload.analysisId,
      artifactType: 'report_pdf',
      storagePath: result.generatedArtifacts.reportPdfPath,
      fileName: path.basename(result.generatedArtifacts.reportPdfPath),
      mimeType: 'application/pdf',
      fileSizeBytes: stats.size,
    });
  }

  return result;
}

/**
 * Reconciles interrupted jobs on system startup, marking lingering 'running' jobs as failed.
 */
export async function reconcileInterruptedJobs(
  dbOrRepo: DatabaseAdapter | IAnalysisRepository,
  organizationId?: string
): Promise<number> {
  const analysisRepo = 'createAnalysis' in dbOrRepo && 'getAnalysisById' in dbOrRepo && 'init' in dbOrRepo
    ? new AnalysisRepository(dbOrRepo as DatabaseAdapter)
    : (dbOrRepo as IAnalysisRepository);
  let reconciledCount = 0;

  if (organizationId) {
    const analyses = await analysisRepo.listForOrganization(organizationId);
    for (const a of analyses) {
      if (a.status === 'running') {
        await analysisRepo.update(a.id, {
          status: 'failed',
          stage: 'failed',
          errorMessage: 'Job interrupted by application restart or worker crash. Eligible for re-submission.',
          errorCategory: 'infrastructure',
        });
        reconciledCount++;
      }
    }
  }

  return reconciledCount;
}

/**
 * In-Memory Queue Adapter with full stage progression, cancellation, and retry management.
 */
export class InMemoryAnalysisQueue implements AnalysisQueueAdapter {
  private abortControllers = new Map<string, AbortController>();
  private activeJobs = new Set<string>();
  private analysisRepo: IAnalysisRepository;
  private datasetRepo: IDatasetRepository;

  constructor(dbOrRepos: DatabaseAdapter | AnalysisQueueRepositories) {
    const repos = resolveQueueRepos(dbOrRepos);
    this.analysisRepo = repos.analysisRepo;
    this.datasetRepo = repos.datasetRepo;
  }

  isReady(): boolean {
    return true;
  }

  async submitJob(payload: AnalysisJobPayload): Promise<{ jobId: string }> {
    const jobId = `job_${crypto.randomUUID()}`;
    const controller = new AbortController();
    this.abortControllers.set(jobId, controller);

    // Update job id on analysis
    await this.analysisRepo.update(payload.analysisId, {
      jobId,
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
    });

    // Execute asynchronously on next event loop tick
    setImmediate(async () => {
      this.activeJobs.add(jobId);
      let retriesLeft = 2;
      let success = false;

      while (!success && retriesLeft >= 0) {
        if (controller.signal.aborted) {
          await this.analysisRepo.update(payload.analysisId, {
            status: 'cancelled',
            stage: 'cancelled',
            errorMessage: 'Job was cancelled by user.',
          });
          break;
        }

        try {
          await processAnalysisJob({ analysisRepo: this.analysisRepo, datasetRepo: this.datasetRepo }, payload, controller.signal);
          success = true;
        } catch (err: any) {
          if (controller.signal.aborted || err.message?.includes('cancelled')) {
            await this.analysisRepo.update(payload.analysisId, {
              status: 'cancelled',
              stage: 'cancelled',
              errorMessage: 'Job was cancelled by user.',
            });
            break;
          }

          const isTransient = isTransientError(err);
          if (isTransient && retriesLeft > 0) {
            retriesLeft--;
            await this.analysisRepo.update(payload.analysisId, {
              retryCount: 2 - retriesLeft,
              errorMessage: `Transient error, retrying: ${err.message}`,
            });
            await new Promise(res => setTimeout(res, 500));
          } else {
            // Permanent failure or retry budget exhausted
            await this.analysisRepo.update(payload.analysisId, {
              status: 'failed',
              stage: 'failed',
              errorMessage: err.message || String(err),
            });
            break;
          }
        }
      }

      this.activeJobs.delete(jobId);
      this.abortControllers.delete(jobId);
    });

    return { jobId };
  }

  async cancelJob(jobId: string, organizationId: string): Promise<boolean> {
    const analysis = await this.analysisRepo.findByJobId(jobId);
    if (!analysis) return false;
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis Job');

    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }

    await this.analysisRepo.update(analysis.id, {
      status: 'cancelled',
      stage: 'cancelled',
      errorMessage: 'Job was cancelled by user.',
    });
    return true;
  }

  async getJobStatus(jobId: string, organizationId: string): Promise<AnalysisRecord | null> {
    const analysis = await this.analysisRepo.findByJobId(jobId);
    if (!analysis) return null;
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis Job');
    return analysis;
  }

  async close(): Promise<void> {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.activeJobs.clear();
  }
}

/**
 * BullMQ / Redis Queue Adapter for production distributed background execution.
 */
export class BullMqAnalysisQueue implements AnalysisQueueAdapter {
  private queue: Queue;
  private worker: Worker;
  private redisConnection: IORedis.Redis;
  private activeControllers = new Map<string, AbortController>();
  private analysisRepo: IAnalysisRepository;
  private datasetRepo: IDatasetRepository;

  constructor(
    dbOrRepos: DatabaseAdapter | AnalysisQueueRepositories,
    redisUrl: string
  ) {
    const repos = resolveQueueRepos(dbOrRepos);
    this.analysisRepo = repos.analysisRepo;
    this.datasetRepo = repos.datasetRepo;

    this.redisConnection = new IORedis.default(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue('analysis-jobs', { connection: this.redisConnection });

    this.worker = new Worker(
      'analysis-jobs',
      async (job: Job<AnalysisJobPayload>) => {
        const controller = new AbortController();
        this.activeControllers.set(job.id || '', controller);

        try {
          await processAnalysisJob(
            { analysisRepo: this.analysisRepo, datasetRepo: this.datasetRepo },
            job.data,
            controller.signal,
            async (stage, percent) => {
              await job.updateProgress({ stage, percent });
            }
          );
        } finally {
          this.activeControllers.delete(job.id || '');
        }
      },
      {
        connection: this.redisConnection,
        concurrency: 4,
      }
    );
  }

  isReady(): boolean {
    return this.redisConnection.status === 'ready';
  }

  async submitJob(payload: AnalysisJobPayload): Promise<{ jobId: string }> {
    const job = await this.queue.add('execute-analysis', payload, {
      removeOnComplete: true,
      removeOnFail: false,
    });
    const jobId = job.id || `job_${crypto.randomUUID()}`;

    await this.analysisRepo.update(payload.analysisId, {
      jobId,
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
    });

    return { jobId };
  }

  async cancelJob(jobId: string, organizationId: string): Promise<boolean> {
    const analysis = await this.analysisRepo.findByJobId(jobId);
    if (!analysis) return false;
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis Job');

    const controller = this.activeControllers.get(jobId);
    if (controller) {
      controller.abort();
    }

    const job = await this.queue.getJob(jobId);
    if (job) {
      try {
        await job.remove();
      } catch {
        // Job might be active or already removed
      }
    }

    await this.analysisRepo.update(analysis.id, {
      status: 'cancelled',
      stage: 'cancelled',
      errorMessage: 'Job was cancelled by user.',
    });
    return true;
  }

  async getJobStatus(jobId: string, organizationId: string): Promise<AnalysisRecord | null> {
    const analysis = await this.analysisRepo.findByJobId(jobId);
    if (!analysis) return null;
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis Job');
    return analysis;
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.redisConnection.quit();
  }
}

let activeQueue: AnalysisQueueAdapter | null = null;

export function getAnalysisQueue(dbOrRepos: DatabaseAdapter | AnalysisQueueRepositories, forceMemory = false): AnalysisQueueAdapter {
  if (activeQueue) return activeQueue;

  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL;

  if (isProduction) {
    if (forceMemory) {
      throw new Error(
        'Configuration Error: In-memory queue adapter (InMemoryAnalysisQueue) is prohibited in production mode. Redis/BullMQ is mandatory for durable background jobs.'
      );
    }
    if (!redisUrl) {
      throw new Error(
        'Configuration Error: Missing REDIS_URL. In production mode, Redis/BullMQ is mandatory for durable background jobs.'
      );
    }
    try {
      activeQueue = new BullMqAnalysisQueue(dbOrRepos, redisUrl);
      return activeQueue;
    } catch (err: any) {
      const sanitized = (redisUrl || '').replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
      throw new Error(`Failed to initialize production BullMQ queue with Redis (${sanitized}): ${err.message}`);
    }
  }

  // Development and test environments
  if (!forceMemory && redisUrl && process.env.NODE_ENV !== 'test') {
    try {
      activeQueue = new BullMqAnalysisQueue(dbOrRepos, redisUrl);
      return activeQueue;
    } catch {
      // Fallback to in-memory if Redis connection fails in development
    }
  }

  activeQueue = new InMemoryAnalysisQueue(dbOrRepos);
  return activeQueue;
}

export function setAnalysisQueue(queue: AnalysisQueueAdapter | null): void {
  activeQueue = queue;
}

