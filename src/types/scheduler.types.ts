/**
 * Scheduler and recurrence domain and persistence types.
 */

export type ScheduleType = 'recurring' | 'one_time';
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';
export type ScheduleRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type ExportReportFormat = 'html' | 'pdf' | 'both';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';
import type { BiExportStatus } from './bi.types.js';

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

export interface CreateScheduleInput {
  organizationId: string;
  userId: string;
  datasetId: string;
  name: string;
  userQuery: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  timezone?: string;
  oneTimeRunAt?: string;
  concurrencyLimit?: number;
  deliveryDestinationId?: string;
  biConnectionId?: string;
  exportFormat?: ExportReportFormat;
}

export interface UpdateScheduleInput {
  name?: string;
  userQuery?: string;
  cronExpression?: string;
  timezone?: string;
  oneTimeRunAt?: string;
  concurrencyLimit?: number;
  isEnabled?: boolean;
  deliveryDestinationId?: string | null;
  biConnectionId?: string | null;
  exportFormat?: ExportReportFormat;
}

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

export type CreateScheduleRunInput = Omit<ScheduleRunRecord, 'createdAt'>;

export type UpdateScheduleRunInput = Partial<Omit<ScheduleRunRecord, 'id' | 'scheduleId' | 'organizationId' | 'createdAt'>>;
