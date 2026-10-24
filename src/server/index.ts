import http from 'node:http';
import { DatabaseAdapter, getDatabaseAdapter } from '../lib/db/adapter.js';
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
} from '../lib/db/repositories/index.js';
import { AuthService } from '../lib/auth/service.js';
import { DatasetStorageService } from '../lib/dataset/storage.js';
import { getAnalysisQueue, reconcileInterruptedJobs } from '../lib/queue/analysis-queue.js';
import type { AnalysisQueueAdapter } from '../types/analysis.types.js';
import { AuthorizationError } from '../lib/auth/rbac.js';
import { ScheduleService } from '../lib/scheduler/service.js';
import { SchedulerDaemon } from '../lib/scheduler/daemon.js';
import { DeliveryService } from '../lib/delivery/service.js';
import { BiIntegrationService } from '../lib/bi/service.js';

import type { ServerRepositories, ServerServices, ServerInstance, RequestContext } from './types.js';
import {
  checkRateLimit,
  parseJsonBody,
  parseBufferBody,
  extractAuthContext,
  sanitizeErrorMessage,
  tryServeStatic,
} from './helpers.js';
import { dispatchRoutes } from './routes/index.js';

export type { ServerRepositories, ServerServices, ServerInstance, RequestContext } from './types.js';

export function createAppServer(options?: {
  db?: DatabaseAdapter;
  queue?: AnalysisQueueAdapter;
  storage?: DatasetStorageService;
  port?: number;
  startScheduler?: boolean;
}): Promise<ServerInstance> {
  const db = options?.db || getDatabaseAdapter();
  const userRepo = new UserRepository(db);
  const organizationRepo = new OrganizationRepository(db);
  const sessionRepo = new SessionRepository(db);
  const datasetRepo = new DatasetRepository(db);
  const analysisRepo = new AnalysisRepository(db);
  const scheduleRepo = new ScheduleRepository(db);
  const deliveryRepo = new DeliveryRepository(db);
  const biRepo = new BiRepository(db);
  const auditRepo = new AuditRepository(db);

  const repositories: ServerRepositories = {
    user: userRepo,
    organization: organizationRepo,
    session: sessionRepo,
    dataset: datasetRepo,
    analysis: analysisRepo,
    schedule: scheduleRepo,
    delivery: deliveryRepo,
    bi: biRepo,
    audit: auditRepo,
  };

  const queue = options?.queue || getAnalysisQueue({ analysisRepo, datasetRepo });
  const storage = options?.storage || new DatasetStorageService(datasetRepo);
  const authService = new AuthService({ userRepo, organizationRepo, sessionRepo });
  const scheduleService = new ScheduleService({ scheduleRepo, datasetRepo, deliveryRepo, biRepo, auditRepo });
  const deliveryService = new DeliveryService({ deliveryRepo, scheduleRepo, analysisRepo, auditRepo });
  const biService = new BiIntegrationService({ biRepo, auditRepo, analysisRepo, scheduleRepo });
  const schedulerDaemon = new SchedulerDaemon(
    { scheduleRepo, datasetRepo, analysisRepo, auditRepo, deliveryService, biService },
    queue
  );

  const services: ServerServices = {
    auth: authService,
    storage,
    schedule: scheduleService,
    delivery: deliveryService,
    bi: biService,
    schedulerDaemon,
    queue,
  };

  reconcileInterruptedJobs(repositories.analysis).catch(() => {});
  if (options?.startScheduler !== false) schedulerDaemon.start();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Please slow down.' }));
        return;
      }

      const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const sendJson = (statusCode: number, data: unknown) => {
        const payload = JSON.stringify(data);
        res.writeHead(statusCode, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        });
        res.end(payload);
      };

      try {
        const ctx: RequestContext = {
          req,
          res,
          pathname: urlObj.pathname,
          urlObj,
          clientIp,
          db,
          repositories,
          services,
          parseJsonBody: () => parseJsonBody(req),
          parseBufferBody: () => parseBufferBody(req),
          getAuthContext: (opts) => extractAuthContext(req, authService, opts),
          sendJson,
        };

        const handled = await dispatchRoutes(ctx);
        if (handled) return;

        if (tryServeStatic(urlObj.pathname, res)) return;

        sendJson(404, { error: `Endpoint ${req.method} ${urlObj.pathname} not found.` });
      } catch (err: any) {
        const statusCode = err instanceof AuthorizationError ? err.statusCode : 400;
        sendJson(statusCode, {
          error: sanitizeErrorMessage(err.message || 'An unexpected error occurred.'),
          code: err.name,
        });
      }
    });

    const targetPort = options?.port || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
    server.listen(targetPort, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : targetPort;
      resolve({
        server,
        port: actualPort,
        db,
        repositories,
        queue,
        storage,
        authService,
        scheduleService,
        deliveryService,
        biService,
        schedulerDaemon,
        close: async () => {
          schedulerDaemon.stop();
          if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
          }
          await queue.close();
          await db.close();
          await new Promise<void>(resClose => server.close(() => resClose()));
        },
      });
    });

    server.on('error', reject);
  });
}

if (process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js')) {
  createAppServer().then(instance => {
    console.log(`Autonomous Data Analyst API Server listening on http://localhost:${instance.port}`);
  });
}
