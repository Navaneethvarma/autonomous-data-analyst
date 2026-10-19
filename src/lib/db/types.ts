export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  csrfToken: string;
  expiresAt: string;
  createdAt: string;
}

export type DatasetFormat = 'csv' | 'parquet';
export type DatasetStatus = 'registered' | 'profiling' | 'ready' | 'error';

export interface DatasetRecord {
  id: string;
  organizationId: string;
  uploadedByUserId: string;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  format: DatasetFormat;
  rowCount: number;
  columnCount: number;
  schemaFingerprint: string;
  status: DatasetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetProfileRecord {
  id: string;
  datasetId: string;
  profileJson: string; // JSON stringified DatasetProfile
  createdAt: string;
}

export type AnalysisJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial_success';

export interface AnalysisRecord {
  id: string;
  organizationId: string;
  userId: string;
  datasetId: string;
  userQuery: string;
  jobId: string;
  status: AnalysisJobStatus;
  stage: string;
  progressPercent: number;
  executionResultJson?: string | null;
  validationResultJson?: string | null;
  insightsJson?: string | null;
  dashboardSpecJson?: string | null;
  clarificationQuestion?: string | null;
  finalExplanation?: string | null;
  errorMessage?: string | null;
  errorCategory?: string | null;
  traceId?: string | null;
  runId?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ArtifactType = 'dashboard_spec' | 'report_html' | 'report_pdf' | 'trace_log';

export interface ArtifactRecord {
  id: string;
  organizationId: string;
  analysisId: string;
  artifactType: ArtifactType;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
}

// Milestone 12 Types
export type ScheduleType = 'recurring' | 'one_time';
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';
export type ExportReportFormat = 'html' | 'pdf' | 'both';

export interface ScheduleRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  datasetId: string;
  name: string;
  userQuery: string;
  scheduleType: ScheduleType;
  cronExpression?: string | null;
  timezone: string;
  oneTimeRunAt?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  concurrencyLimit: number;
  isEnabled: boolean;
  deliveryDestinationId?: string | null;
  biConnectionId?: string | null;
  exportFormat: ExportReportFormat;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type BiExportStatus = 'pending' | 'exported' | 'failed' | 'skipped';

export interface ScheduleRunRecord {
  id: string;
  scheduleId: string;
  organizationId: string;
  analysisId?: string | null;
  scheduledFor: string;
  startedAt: string;
  completedAt?: string | null;
  status: ScheduleRunStatus;
  errorMessage?: string | null;
  deliveryStatus?: DeliveryStatus | null;
  deliveryDetailsJson?: string | null;
  biExportStatus?: BiExportStatus | null;
  biExportDetailsJson?: string | null;
  retryCount: number;
  createdAt: string;
}

export type DeliveryDestinationType = 'email' | 'webhook';

export interface DeliveryDestinationRecord {
  id: string;
  organizationId: string;
  name: string;
  destinationType: DeliveryDestinationType;
  recipientEmails?: string | null;
  webhookUrl?: string | null;
  encryptedSecret?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BiPlatformType = 'superset' | 'metabase';
export type BiConnectionStatus = 'untested' | 'connected' | 'error';

export interface BiConnectionRecord {
  id: string;
  organizationId: string;
  name: string;
  platformType: BiPlatformType;
  hostUrl: string;
  encryptedCredentials: string; // AES-256-GCM encrypted
  status: BiConnectionStatus;
  lastTestedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  detailsJson?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

