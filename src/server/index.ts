import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseAdapter, getDatabaseAdapter } from '../lib/db/adapter.js';
import { AuthService, AuthenticatedContext } from '../lib/auth/service.js';
import { DatasetStorageService } from '../lib/dataset/storage.js';
import { AnalysisQueueAdapter, getAnalysisQueue, reconcileInterruptedJobs } from '../lib/queue/analysis-queue.js';
import { assertPermission, assertTenantScope, AuthorizationError } from '../lib/auth/rbac.js';
import { executeAnalyticalQuery } from '../lib/analytics/duckdb-engine.js';

import { ScheduleService } from '../lib/scheduler/service.js';
import { SchedulerDaemon } from '../lib/scheduler/daemon.js';
import { DeliveryService } from '../lib/delivery/service.js';
import { BiIntegrationService } from '../lib/bi/service.js';
import { encryptSecret } from '../lib/security/encryption.js';
import { DeliveryDestinationType, BiPlatformType, ExportReportFormat } from '../lib/db/types.js';

export interface ServerInstance {
  server: http.Server;
  port: number;
  db: DatabaseAdapter;
  queue: AnalysisQueueAdapter;
  storage: DatasetStorageService;
  authService: AuthService;
  scheduleService: ScheduleService;
  deliveryService: DeliveryService;
  biService: BiIntegrationService;
  schedulerDaemon: SchedulerDaemon;
  close: () => Promise<void>;
}

// Simple IP-based rate limiter
const rateLimits = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(ip: string, limit = 120, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record || now > record.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

// Dedicated login rate limiter (max 5 attempts per minute per IP)
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
function checkLoginRateLimit(ip: string, limit = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

/**
 * Formats a secure session cookie string with appropriate SameSite and Secure flags in production.
 */
function formatSessionCookie(token: string, maxAgeSeconds = 604800): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `session_token=${token}; HttpOnly; SameSite=Strict; Path=/${isProd ? '; Secure' : ''}; Max-Age=${maxAgeSeconds}`;
}

export function createAppServer(options?: {
  db?: DatabaseAdapter;
  queue?: AnalysisQueueAdapter;
  storage?: DatasetStorageService;
  port?: number;
  startScheduler?: boolean;
}): Promise<ServerInstance> {
  const db = options?.db || getDatabaseAdapter();
  const queue = options?.queue || getAnalysisQueue(db);
  const storage = options?.storage || new DatasetStorageService(db);
  const authService = new AuthService(db);
  const scheduleService = new ScheduleService(db);
  const deliveryService = new DeliveryService(db);
  const biService = new BiIntegrationService(db);
  const schedulerDaemon = new SchedulerDaemon(db, queue);

  // Reconcile any interrupted running analyses from previous process crash/restart
  reconcileInterruptedJobs(db).catch(() => {});

  if (options?.startScheduler !== false) {
    schedulerDaemon.start();
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Set baseline security headers
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
      const pathname = urlObj.pathname;

      // Helper: parse JSON body
      const parseJsonBody = async <T = any>(): Promise<T> => {
        return new Promise((resolveBody, rejectBody) => {
          let data = '';
          req.on('data', chunk => {
            data += chunk;
            if (data.length > 50 * 1024 * 1024) {
              rejectBody(new Error('Request payload exceeds size limit'));
            }
          });
          req.on('end', () => {
            if (!data) return resolveBody({} as T);
            try {
              resolveBody(JSON.parse(data));
            } catch (err: any) {
              rejectBody(new Error(`Malformed JSON body: ${err.message}`));
            }
          });
          req.on('error', rejectBody);
        });
      };

      // Helper: parse raw buffer body (for uploads)
      const parseBufferBody = async (): Promise<Buffer> => {
        return new Promise((resolveBuf, rejectBuf) => {
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          req.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > 60 * 1024 * 1024) {
              rejectBuf(new Error('Uploaded file exceeds size limit (50MB)'));
            }
            chunks.push(chunk);
          });
          req.on('end', () => resolveBuf(Buffer.concat(chunks)));
          req.on('error', rejectBuf);
        });
      };

      // Helper: Authenticate request via Bearer token or Cookie with CSRF defense
      const getAuthContext = async (options?: { skipCsrf?: boolean }): Promise<AuthenticatedContext> => {
        let token = '';
        let fromCookie = false;
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7).trim();
        } else if (req.headers.cookie) {
          const match = req.headers.cookie.match(/session_token=([^;]+)/);
          if (match && match[1]) {
            token = match[1];
            fromCookie = true;
          }
        }

        if (!token) {
          throw new AuthorizationError('Authentication required. Missing session token.', 401);
        }

        const auth = await authService.authenticateToken(token);

        // Enforce CSRF validation for cookie-authenticated mutating HTTP methods
        const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '');
        if (fromCookie && isMutation && !options?.skipCsrf) {
          const csrfHeader = req.headers['x-csrf-token'];
          if (!csrfHeader || typeof csrfHeader !== 'string') {
            throw new AuthorizationError('CSRF token missing for cookie-authenticated mutation request.', 403);
          }
          const provided = Buffer.from(csrfHeader);
          const expected = Buffer.from(auth.csrfToken);
          if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
            throw new AuthorizationError('Invalid CSRF token.', 403);
          }
        }

        return auth;
      };

      const sendJson = (statusCode: number, data: unknown) => {
        const payload = JSON.stringify(data);
        res.writeHead(statusCode, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        });
        res.end(payload);
      };

      try {
        // =====================================================================
        // HEALTH CHECK
        // =====================================================================
        if (pathname === '/api/health') {
          const dbHealth = await db.checkHealth();
          sendJson(dbHealth.ok ? 200 : 503, {
            status: dbHealth.ok ? 'healthy' : 'degraded',
            database: dbHealth.ok ? 'connected' : 'error',
            queue: queue.isReady() ? 'ready' : 'in-memory',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // =====================================================================
        // AUTH ROUTES
        // =====================================================================
        if (pathname === '/api/auth/register' && req.method === 'POST') {
          const body = await parseJsonBody();
          if (!body.email || !body.password || !body.name) {
            sendJson(400, { error: 'email, password, and name are required' });
            return;
          }
          const result = await authService.register(body);
          // Set secure cookie
          res.setHeader('Set-Cookie', formatSessionCookie(result.token));
          sendJson(201, {
            user: { id: result.user.id, email: result.user.email, name: result.user.name },
            organization: result.organization,
            role: 'admin',
            token: result.token,
            csrfToken: result.csrfToken,
          });
          return;
        }

        if (pathname === '/api/auth/login' && req.method === 'POST') {
          const body = await parseJsonBody();

          if (!checkLoginRateLimit(clientIp)) {
            sendJson(429, { error: 'Too many login attempts. Please wait 1 minute.' });
            return;
          }

          if (!body.email || !body.password) {
            sendJson(400, { error: 'email and password are required' });
            return;
          }
          const result = await authService.login(body);
          res.setHeader('Set-Cookie', formatSessionCookie(result.token));
          sendJson(200, {
            user: { id: result.user.id, email: result.user.email, name: result.user.name },
            organization: result.organization,
            role: result.role,
            token: result.token,
            csrfToken: result.csrfToken,
          });
          return;
        }

        if (pathname === '/api/auth/logout' && req.method === 'POST') {
          let token = '';
          const authHeader = req.headers['authorization'];
          if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
          } else if (req.headers.cookie) {
            const match = req.headers.cookie.match(/session_token=([^;]+)/);
            if (match && match[1]) token = match[1];
          }
          if (token) {
            await authService.logout(token);
          }
          res.setHeader('Set-Cookie', formatSessionCookie('', 0));
          sendJson(200, { message: 'Logged out successfully' });
          return;
        }

        if (pathname === '/api/auth/me' && req.method === 'GET') {
          const auth = await getAuthContext();
          sendJson(200, {
            user: { id: auth.user.id, email: auth.user.email, name: auth.user.name },
            organization: auth.organization,
            role: auth.role,
            csrfToken: auth.csrfToken,
          });
          return;
        }

        if (pathname === '/api/auth/members' && req.method === 'POST') {
          const auth = await getAuthContext();
          const body = await parseJsonBody();
          if (!body.email || !body.role) {
            sendJson(400, { error: 'email and role are required' });
            return;
          }
          await authService.addMember(auth, body.email, body.role);
          sendJson(200, { message: `Member ${body.email} updated to role ${body.role}` });
          return;
        }

        // =====================================================================
        // DATASET ROUTES
        // =====================================================================
        if (pathname === '/api/datasets/upload' && req.method === 'POST') {
          const auth = await getAuthContext();
          const contentType = req.headers['content-type'] || '';

          let filename = 'dataset.csv';
          let buffer: Buffer;

          if (contentType.includes('application/json')) {
            const body = await parseJsonBody();
            filename = body.filename || 'dataset.csv';
            if (body.contentBase64) {
              buffer = Buffer.from(body.contentBase64, 'base64');
            } else if (body.content) {
              buffer = Buffer.from(body.content, 'utf8');
            } else {
              sendJson(400, { error: 'content or contentBase64 is required' });
              return;
            }
          } else {
            // Raw binary stream with header filename or query param
            const queryName = urlObj.searchParams.get('filename');
            filename = queryName || (req.headers['x-filename'] as string) || 'uploaded_data.csv';
            buffer = await parseBufferBody();
          }

          const result = await storage.uploadAndRegisterDataset(auth, {
            originalFilename: filename,
            buffer,
          });

          // Return sanitized dataset (without leaking raw internal filesystem path)
          sendJson(201, {
            dataset: {
              id: result.dataset.id,
              originalFilename: result.dataset.originalFilename,
              fileSizeBytes: result.dataset.fileSizeBytes,
              format: result.dataset.format,
              rowCount: result.dataset.rowCount,
              columnCount: result.dataset.columnCount,
              schemaFingerprint: result.dataset.schemaFingerprint,
              status: result.dataset.status,
              createdAt: result.dataset.createdAt,
            },
            profile: result.profile,
          });
          return;
        }

        if (pathname === '/api/datasets' && req.method === 'GET') {
          const auth = await getAuthContext();
          const datasets = await storage.listDatasets(auth);
          sendJson(
            200,
            datasets.map(d => ({
              id: d.id,
              originalFilename: d.originalFilename,
              fileSizeBytes: d.fileSizeBytes,
              format: d.format,
              rowCount: d.rowCount,
              columnCount: d.columnCount,
              schemaFingerprint: d.schemaFingerprint,
              status: d.status,
              createdAt: d.createdAt,
            }))
          );
          return;
        }

        // Match /api/datasets/:id and sub-resources
        const datasetMatch = pathname.match(/^\/api\/datasets\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
        if (datasetMatch && datasetMatch[1]) {
          const datasetId = datasetMatch[1];
          const subResource = datasetMatch[2];
          const auth = await getAuthContext();

          if (!subResource && req.method === 'GET') {
            const dataset = await storage.getDataset(auth, datasetId);
            sendJson(200, {
              id: dataset.id,
              originalFilename: dataset.originalFilename,
              fileSizeBytes: dataset.fileSizeBytes,
              format: dataset.format,
              rowCount: dataset.rowCount,
              columnCount: dataset.columnCount,
              schemaFingerprint: dataset.schemaFingerprint,
              status: dataset.status,
              createdAt: dataset.createdAt,
            });
            return;
          }

          if (subResource === 'profile' && req.method === 'GET') {
            const profile = await storage.getDatasetProfile(auth, datasetId);
            if (!profile) {
              sendJson(404, { error: 'Dataset profile not found' });
              return;
            }
            sendJson(200, profile);
            return;
          }

          if (subResource === 'preview' && req.method === 'GET') {
            const dataset = await storage.getDataset(auth, datasetId);
            const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 100);
            const queryRes = await executeAnalyticalQuery(
              {
                datasetPath: dataset.storagePath,
                sql: `SELECT * FROM dataset LIMIT ${limit}`,
              },
              { customBaseDir: storage.getBaseDir() }
            );
            sendJson(200, {
              rows: queryRes.rows,
              rowCount: queryRes.rowCount,
              columns: queryRes.columns,
            });
            return;
          }

          if (!subResource && req.method === 'DELETE') {
            await storage.deleteDataset(auth, datasetId);
            sendJson(200, { message: 'Dataset deleted successfully' });
            return;
          }
        }

        // =====================================================================
        // ANALYSES & QUEUE ROUTES
        // =====================================================================
        if (pathname === '/api/analyses' && req.method === 'POST') {
          const auth = await getAuthContext();
          assertPermission(auth.role, 'analysis:create');
          const body = await parseJsonBody();

          if (!body.datasetId || !body.userQuery) {
            sendJson(400, { error: 'datasetId and userQuery are required' });
            return;
          }

          // Verify dataset belongs to tenant
          const dataset = await storage.getDataset(auth, body.datasetId);

          // Idempotency: Check if an active analysis with the same query and dataset is currently queued or running
          const existingAnalyses = await db.listAnalysesByOrg(auth.organization.id);
          const activeDuplicate = existingAnalyses.find(
            a =>
              a.datasetId === dataset.id &&
              a.userQuery.trim().toLowerCase() === body.userQuery.trim().toLowerCase() &&
              (a.status === 'queued' || a.status === 'running')
          );

          if (activeDuplicate) {
            sendJson(200, {
              analysisId: activeDuplicate.id,
              jobId: activeDuplicate.jobId,
              status: activeDuplicate.status,
              message: 'An identical analysis is already in progress.',
              isDuplicate: true,
            });
            return;
          }

          const analysisId = crypto.randomUUID();
          await db.createAnalysis({
            id: analysisId,
            organizationId: auth.organization.id,
            userId: auth.user.id,
            datasetId: dataset.id,
            userQuery: body.userQuery.trim(),
            jobId: 'pending',
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
            retryCount: 0,
          });

          let jobId: string;
          try {
            const submission = await queue.submitJob({
              analysisId,
              organizationId: auth.organization.id,
              userId: auth.user.id,
              datasetId: dataset.id,
              datasetPath: dataset.storagePath,
              userQuery: body.userQuery.trim(),
            });
            jobId = submission.jobId;
          } catch (queueErr: any) {
            await db.updateAnalysis(analysisId, {
              status: 'failed',
              stage: 'failed',
              errorMessage: `Queue submission failed: ${queueErr.message}`,
              errorCategory: 'infrastructure',
            });
            sendJson(503, {
              error: 'Operational Failure: Background job queue was unable to accept this analysis. Please retry.',
              analysisId,
            });
            return;
          }

          sendJson(202, {
            analysisId,
            jobId,
            status: 'queued',
            message: 'Analysis job submitted successfully.',
          });
          return;
        }

        if (pathname === '/api/analyses' && req.method === 'GET') {
          const auth = await getAuthContext();
          assertPermission(auth.role, 'analysis:read');
          const analyses = await db.listAnalysesByOrg(auth.organization.id);
          sendJson(200, analyses);
          return;
        }

        const analysisMatch = pathname.match(/^\/api\/analyses\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
        if (analysisMatch && analysisMatch[1]) {
          const analysisId = analysisMatch[1];
          const subResource = analysisMatch[2];
          const auth = await getAuthContext();
          assertPermission(auth.role, 'analysis:read');

          const analysis = await db.getAnalysisById(analysisId);
          if (!analysis) {
            sendJson(404, { error: 'Analysis not found' });
            return;
          }
          assertTenantScope(auth.organization.id, analysis.organizationId, 'Analysis');

          if (!subResource && req.method === 'GET') {
            // Return parsed JSON results for frontend consumption
            sendJson(200, {
              ...analysis,
              executionResult: analysis.executionResultJson ? JSON.parse(analysis.executionResultJson) : null,
              validationResult: analysis.validationResultJson ? JSON.parse(analysis.validationResultJson) : null,
              insights: analysis.insightsJson ? JSON.parse(analysis.insightsJson) : [],
              dashboardSpec: analysis.dashboardSpecJson ? JSON.parse(analysis.dashboardSpecJson) : null,
            });
            return;
          }

          if (subResource === 'cancel' && req.method === 'POST') {
            assertPermission(auth.role, 'analysis:cancel');
            const cancelled = await queue.cancelJob(analysis.jobId, auth.organization.id);
            sendJson(200, { success: cancelled, message: 'Analysis cancellation initiated' });
            return;
          }
        }

        // =====================================================================
        // ARTIFACT ROUTES (Secure HTML/PDF and Dashboard Delivery)
        // =====================================================================
        const artifactMatch = pathname.match(/^\/api\/artifacts\/([a-zA-Z0-9_\-]+)$/);
        if (artifactMatch && artifactMatch[1] && req.method === 'GET') {
          const artifactId = artifactMatch[1];
          const auth = await getAuthContext();
          assertPermission(auth.role, 'artifact:download');

          const artifact = await db.getArtifactById(artifactId);
          if (!artifact) {
            sendJson(404, { error: 'Artifact not found' });
            return;
          }
          assertTenantScope(auth.organization.id, artifact.organizationId, 'Artifact');

          if (artifact.storagePath.startsWith('db://')) {
            // Dashboard spec or trace log stored inline in analysis record
            const analysis = await db.getAnalysisById(artifact.analysisId);
            if (analysis && analysis.dashboardSpecJson) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(analysis.dashboardSpecJson);
              return;
            }
          }

          // Physical file delivery with path traversal defense
          const normalizedPath = path.resolve(artifact.storagePath);
          const reportsDir = path.resolve(process.cwd(), 'reports');
          const datasetsDir = path.resolve(process.cwd(), 'datasets');

          const isAuthorizedLocation =
            normalizedPath.startsWith(reportsDir) || normalizedPath.startsWith(datasetsDir);

          if (!isAuthorizedLocation || !fs.existsSync(normalizedPath)) {
            sendJson(404, { error: 'Artifact file not found or inaccessible.' });
            return;
          }

          const fileContent = fs.readFileSync(normalizedPath);
          res.writeHead(200, {
            'Content-Type': artifact.mimeType,
            'Content-Length': fileContent.length,
            'Content-Disposition': `inline; filename="${artifact.fileName}"`,
          });
          res.end(fileContent);
          return;
        }

        // =====================================================================
        // SCHEDULE ROUTES (Milestone 12)
        // =====================================================================
        if (pathname === '/api/schedules') {
          const auth = await getAuthContext();

          if (req.method === 'GET') {
            assertPermission(auth.role, 'schedule:read');
            const schedules = await db.listSchedulesByOrg(auth.organization.id);
            sendJson(200, { schedules });
            return;
          }

          if (req.method === 'POST') {
            assertPermission(auth.role, 'schedule:manage');
            const body = await parseJsonBody<{
              datasetId: string;
              name: string;
              userQuery: string;
              scheduleType: 'recurring' | 'one_time';
              cronExpression?: string;
              timezone?: string;
              oneTimeRunAt?: string;
              concurrencyLimit?: number;
              deliveryDestinationId?: string;
              biConnectionId?: string;
              exportFormat?: ExportReportFormat;
            }>();

            const schedule = await scheduleService.createSchedule({
              ...body,
              organizationId: auth.organization.id,
              userId: auth.user.id,
            });
            sendJson(201, { schedule });
            return;
          }
        }

        const scheduleDetailMatch = pathname.match(/^\/api\/schedules\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
        if (scheduleDetailMatch && scheduleDetailMatch[1]) {
          const scheduleId = scheduleDetailMatch[1];
          const subAction = scheduleDetailMatch[2];
          const auth = await getAuthContext();

          if (!subAction && req.method === 'GET') {
            assertPermission(auth.role, 'schedule:read');
            const schedule = await db.getScheduleById(scheduleId, auth.organization.id);
            if (!schedule) {
              sendJson(404, { error: 'Schedule not found' });
              return;
            }
            sendJson(200, { schedule });
            return;
          }

          if (!subAction && req.method === 'PUT') {
            assertPermission(auth.role, 'schedule:manage');
            const body = await parseJsonBody<any>();
            const schedule = await scheduleService.updateSchedule(
              scheduleId,
              auth.organization.id,
              auth.user.id,
              body
            );
            sendJson(200, { schedule });
            return;
          }

          if (!subAction && req.method === 'DELETE') {
            assertPermission(auth.role, 'schedule:manage');
            const deleted = await scheduleService.deleteSchedule(
              scheduleId,
              auth.organization.id,
              auth.user.id
            );
            sendJson(200, { success: deleted });
            return;
          }

          if (subAction === 'trigger' && req.method === 'POST') {
            assertPermission(auth.role, 'schedule:manage');
            const schedule = await db.getScheduleById(scheduleId, auth.organization.id);
            if (!schedule) {
              sendJson(404, { error: 'Schedule not found' });
              return;
            }
            const dispatched = await schedulerDaemon.dispatchSchedule(schedule, new Date().toISOString());
            sendJson(200, { success: dispatched, message: dispatched ? 'Schedule triggered successfully' : 'Schedule reached concurrency limit or in-flight' });
            return;
          }

          if (subAction === 'runs' && req.method === 'GET') {
            assertPermission(auth.role, 'schedule:read');
            const runs = await scheduleService.listScheduleRuns(scheduleId, auth.organization.id);
            sendJson(200, { runs });
            return;
          }
        }

        // =====================================================================
        // DELIVERY DESTINATIONS ROUTES (Milestone 12)
        // =====================================================================
        if (pathname === '/api/delivery/destinations') {
          const auth = await getAuthContext();

          if (req.method === 'GET') {
            assertPermission(auth.role, 'delivery:read');
            const destinations = await db.listDeliveryDestinationsByOrg(auth.organization.id);
            const sanitized = destinations.map(d => ({
              ...d,
              encryptedSecret: undefined,
              hasSecret: !!d.encryptedSecret,
            }));
            sendJson(200, { destinations: sanitized });
            return;
          }

          if (req.method === 'POST') {
            assertPermission(auth.role, 'delivery:manage');
            const body = await parseJsonBody<{
              name: string;
              destinationType: DeliveryDestinationType;
              recipientEmails?: string;
              webhookUrl?: string;
              secret?: string;
            }>();

            const encryptedSecret = body.secret ? encryptSecret(body.secret) : null;
            const dest = await db.createDeliveryDestination({
              id: `dest_${crypto.randomUUID()}`,
              organizationId: auth.organization.id,
              name: body.name.trim(),
              destinationType: body.destinationType,
              recipientEmails: body.recipientEmails || null,
              webhookUrl: body.webhookUrl || null,
              encryptedSecret,
              isActive: true,
            });

            sendJson(201, {
              destination: {
                ...dest,
                encryptedSecret: undefined,
                hasSecret: !!dest.encryptedSecret,
              },
            });
            return;
          }
        }

        const deliveryDetailMatch = pathname.match(/^\/api\/delivery\/destinations\/([a-zA-Z0-9_\-]+)$/);
        if (deliveryDetailMatch && deliveryDetailMatch[1]) {
          const destId = deliveryDetailMatch[1];
          const auth = await getAuthContext();

          if (req.method === 'GET') {
            assertPermission(auth.role, 'delivery:read');
            const dest = await db.getDeliveryDestinationById(destId, auth.organization.id);
            if (!dest) {
              sendJson(404, { error: 'Delivery destination not found' });
              return;
            }
            sendJson(200, {
              destination: {
                ...dest,
                encryptedSecret: undefined,
                hasSecret: !!dest.encryptedSecret,
              },
            });
            return;
          }

          if (req.method === 'DELETE') {
            assertPermission(auth.role, 'delivery:manage');
            const deleted = await db.deleteDeliveryDestination(destId, auth.organization.id);
            sendJson(200, { success: deleted });
            return;
          }
        }

        // =====================================================================
        // BI PLATFORM CONNECTIONS ROUTES (Milestone 12)
        // =====================================================================
        if (pathname === '/api/bi/connections') {
          const auth = await getAuthContext();

          if (req.method === 'GET') {
            assertPermission(auth.role, 'bi:read');
            const connections = await db.listBiConnectionsByOrg(auth.organization.id);
            const sanitized = connections.map(c => ({
              ...c,
              encryptedCredentials: undefined,
            }));
            sendJson(200, { connections: sanitized });
            return;
          }

          if (req.method === 'POST') {
            assertPermission(auth.role, 'bi:manage');
            const body = await parseJsonBody<{
              name: string;
              platformType: BiPlatformType;
              hostUrl: string;
              username: string;
              password: string;
            }>();

            const encrypted = encryptSecret(JSON.stringify({
              username: body.username,
              password: body.password,
            }));

            const conn = await db.createBiConnection({
              id: `biconn_${crypto.randomUUID()}`,
              organizationId: auth.organization.id,
              name: body.name.trim(),
              platformType: body.platformType,
              hostUrl: body.hostUrl.trim(),
              encryptedCredentials: encrypted,
              status: 'untested',
              lastTestedAt: null,
              lastError: null,
            });

            sendJson(201, {
              connection: {
                ...conn,
                encryptedCredentials: undefined,
              },
            });
            return;
          }
        }

        const biDetailMatch = pathname.match(/^\/api\/bi\/connections\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
        if (biDetailMatch && biDetailMatch[1]) {
          const connId = biDetailMatch[1];
          const subAction = biDetailMatch[2];
          const auth = await getAuthContext();

          if (!subAction && req.method === 'GET') {
            assertPermission(auth.role, 'bi:read');
            const conn = await db.getBiConnectionById(connId, auth.organization.id);
            if (!conn) {
              sendJson(404, { error: 'BI connection not found' });
              return;
            }
            sendJson(200, {
              connection: {
                ...conn,
                encryptedCredentials: undefined,
              },
            });
            return;
          }

          if (!subAction && req.method === 'DELETE') {
            assertPermission(auth.role, 'bi:manage');
            const deleted = await db.deleteBiConnection(connId, auth.organization.id);
            sendJson(200, { success: deleted });
            return;
          }

          if (subAction === 'test' && req.method === 'POST') {
            assertPermission(auth.role, 'bi:manage');
            const resTest = await biService.testConnection(connId, auth.organization.id);
            sendJson(200, resTest);
            return;
          }

          if (subAction === 'export' && req.method === 'POST') {
            assertPermission(auth.role, 'bi:manage');
            const body = await parseJsonBody<{ analysisId: string; datasourceId?: number }>();
            const resExport = await biService.exportAnalysis({
              connectionId: connId,
              organizationId: auth.organization.id,
              analysisId: body.analysisId,
              datasourceId: body.datasourceId,
            });
            sendJson(200, resExport);
            return;
          }
        }

        // =====================================================================
        // STATIC FRONTEND ASSETS IN PRODUCTION
        // =====================================================================
        if (process.env.NODE_ENV === 'production') {
          const clientDist = path.resolve(process.cwd(), 'dist', 'client');
          let staticPath = path.join(clientDist, pathname === '/' ? 'index.html' : pathname);
          if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
            const ext = path.extname(staticPath);
            const mimes: Record<string, string> = {
              '.html': 'text/html',
              '.js': 'application/javascript',
              '.css': 'text/css',
              '.json': 'application/json',
              '.svg': 'image/svg+xml',
            };
            res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
            fs.createReadStream(staticPath).pipe(res);
            return;
          }
        }

        // Not Found
        sendJson(404, { error: `Endpoint ${req.method} ${pathname} not found.` });
      } catch (err: any) {
        const statusCode = err instanceof AuthorizationError ? err.statusCode : 400;
        const rawMessage = err.message || 'An unexpected error occurred.';
        const sanitized = rawMessage
          .replace(/[a-zA-Z]:\\[^\s:"]+/g, '<host_path>')
          .replace(/\/home\/[^\s:"]+/g, '<host_path>')
          .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@');

        sendJson(statusCode, {
          error: sanitized,
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

// Server entry point when run directly
if (process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js')) {
  createAppServer().then(instance => {
    console.log(`Autonomous Data Analyst API Server listening on http://localhost:${instance.port}`);
  });
}
