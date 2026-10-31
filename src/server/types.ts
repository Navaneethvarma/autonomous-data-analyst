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

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD',
}

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

export enum ApiRoute {
  HEALTH = '/api/health',
  AUTH_REGISTER = '/api/auth/register',
  AUTH_LOGIN = '/api/auth/login',
  AUTH_LOGOUT = '/api/auth/logout',
  AUTH_ME = '/api/auth/me',
  AUTH_MEMBERS = '/api/auth/members',
  DATASETS = '/api/datasets',
  DATASETS_UPLOAD = '/api/datasets/upload',
  ANALYSES = '/api/analyses',
  ARTIFACTS = '/api/artifacts',
  SCHEDULES = '/api/schedules',
  DELIVERY_DESTINATIONS = '/api/delivery/destinations',
  BI_CONNECTIONS = '/api/bi/connections',
  AUDIT_LOGS = '/api/audit/logs',
}

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
