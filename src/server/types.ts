import type http from 'node:http';
import type { DatabaseAdapter } from '../lib/db/types.js';
import type {
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
import type { AuthService } from '../lib/auth/service.js';
import type { AuthenticatedContext } from '../types/auth.types.js';
import type { DatasetStorageService } from '../lib/dataset/storage.js';
import type { AnalysisQueueAdapter } from '../types/analysis.types.js';
import type { ScheduleService } from '../lib/scheduler/service.js';
import type { SchedulerDaemon } from '../lib/scheduler/daemon.js';
import type { DeliveryService } from '../lib/delivery/service.js';
import type { BiIntegrationService } from '../lib/bi/service.js';

export interface ServerRepositories {
  user: UserRepository;
  organization: OrganizationRepository;
  session: SessionRepository;
  dataset: DatasetRepository;
  analysis: AnalysisRepository;
  schedule: ScheduleRepository;
  delivery: DeliveryRepository;
  bi: BiRepository;
  audit: AuditRepository;
}

export interface ServerServices {
  auth: AuthService;
  storage: DatasetStorageService;
  schedule: ScheduleService;
  delivery: DeliveryService;
  bi: BiIntegrationService;
  schedulerDaemon: SchedulerDaemon;
  queue: AnalysisQueueAdapter;
}

export interface ServerInstance {
  server: http.Server;
  port: number;
  db: DatabaseAdapter;
  repositories: ServerRepositories;
  queue: AnalysisQueueAdapter;
  storage: DatasetStorageService;
  authService: AuthService;
  scheduleService: ScheduleService;
  deliveryService: DeliveryService;
  biService: BiIntegrationService;
  schedulerDaemon: SchedulerDaemon;
  close: () => Promise<void>;
}

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  pathname: string;
  urlObj: URL;
  clientIp: string;
  db: DatabaseAdapter;
  repositories: ServerRepositories;
  services: ServerServices;
  parseJsonBody: <T = any>() => Promise<T>;
  parseBufferBody: () => Promise<Buffer>;
  getAuthContext: (options?: { skipCsrf?: boolean }) => Promise<AuthenticatedContext>;
  sendJson: (statusCode: number, data: unknown) => void;
}

export type RouteHandler = (ctx: RequestContext) => Promise<boolean>;
