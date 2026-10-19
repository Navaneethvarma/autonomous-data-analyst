import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/adapter.js';
import { ScheduleRecord, ScheduleRunRecord, ScheduleType, ExportReportFormat } from '../db/types.js';
import { TimezoneScheduler } from './timezone.js';
import { assertTenantScope, AuthorizationError } from '../auth/rbac.js';

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

export class ScheduleService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Creates a new analysis schedule, enforcing dataset ownership and timezone validity.
   */
  async createSchedule(input: CreateScheduleInput): Promise<ScheduleRecord> {
    const { organizationId, userId, datasetId } = input;

    // 1. Verify Dataset tenant ownership
    const dataset = await this.db.getDatasetById(datasetId, organizationId);
    if (!dataset) {
      throw new AuthorizationError(`Dataset '${datasetId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, dataset.organizationId, 'Dataset');

    // 2. Verify Delivery Destination if specified
    if (input.deliveryDestinationId) {
      const dest = await this.db.getDeliveryDestinationById(input.deliveryDestinationId, organizationId);
      if (!dest) {
        throw new AuthorizationError(`Delivery destination '${input.deliveryDestinationId}' not found or unauthorized.`);
      }
      assertTenantScope(organizationId, dest.organizationId, 'DeliveryDestination');
    }

    // 3. Verify BI Connection if specified
    if (input.biConnectionId) {
      const conn = await this.db.getBiConnectionById(input.biConnectionId, organizationId);
      if (!conn) {
        throw new AuthorizationError(`BI connection '${input.biConnectionId}' not found or unauthorized.`);
      }
      assertTenantScope(organizationId, conn.organizationId, 'BiConnection');
    }

    // 4. Timezone and Run calculation
    const timezone = input.timezone || 'UTC';
    if (!TimezoneScheduler.isValidTimezone(timezone)) {
      throw new Error(`Invalid IANA timezone: '${timezone}'`);
    }

    let nextRunAt: string | null = null;
    let cronExpr: string | null = null;
    let oneTimeRunAt: string | null = null;

    if (input.scheduleType === 'recurring') {
      if (!input.cronExpression) {
        throw new Error('cronExpression is required for recurring schedule.');
      }
      if (!TimezoneScheduler.isValidCronExpression(input.cronExpression, timezone)) {
        throw new Error(`Invalid cron expression: '${input.cronExpression}' for timezone '${timezone}'.`);
      }
      cronExpr = input.cronExpression.trim();
      nextRunAt = TimezoneScheduler.getNextRun(cronExpr, timezone);
    } else if (input.scheduleType === 'one_time') {
      if (!input.oneTimeRunAt) {
        throw new Error('oneTimeRunAt ISO timestamp is required for one_time schedule.');
      }
      const parsedDate = new Date(input.oneTimeRunAt);
      if (isNaN(parsedDate.getTime())) {
        throw new Error(`Invalid oneTimeRunAt timestamp: '${input.oneTimeRunAt}'`);
      }
      oneTimeRunAt = parsedDate.toISOString();
      nextRunAt = oneTimeRunAt;
    }

    const scheduleId = `sched_${crypto.randomUUID()}`;
    const record = await this.db.createSchedule({
      id: scheduleId,
      organizationId,
      createdByUserId: userId,
      datasetId,
      name: input.name.trim(),
      userQuery: input.userQuery.trim(),
      scheduleType: input.scheduleType,
      cronExpression: cronExpr,
      timezone,
      oneTimeRunAt,
      nextRunAt,
      lastRunAt: null,
      concurrencyLimit: Math.max(1, input.concurrencyLimit || 1),
      isEnabled: true,
      deliveryDestinationId: input.deliveryDestinationId || null,
      biConnectionId: input.biConnectionId || null,
      exportFormat: input.exportFormat || 'html',
      status: 'active',
    });

    await this.db.createAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      organizationId,
      userId,
      action: 'schedule:created',
      resourceType: 'schedule',
      resourceId: scheduleId,
      detailsJson: JSON.stringify({ name: record.name, type: record.scheduleType, nextRunAt }),
    });

    return record;
  }

  /**
   * Updates an existing schedule within tenant boundary.
   */
  async updateSchedule(
    scheduleId: string,
    organizationId: string,
    userId: string,
    updates: UpdateScheduleInput
  ): Promise<ScheduleRecord> {
    const existing = await this.db.getScheduleById(scheduleId, organizationId);
    if (!existing) {
      throw new AuthorizationError(`Schedule '${scheduleId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, existing.organizationId, 'Schedule');

    const effectiveTimezone = updates.timezone || existing.timezone;
    if (updates.timezone && !TimezoneScheduler.isValidTimezone(effectiveTimezone)) {
      throw new Error(`Invalid IANA timezone: '${updates.timezone}'`);
    }

    const effectiveCron = updates.cronExpression !== undefined ? updates.cronExpression : existing.cronExpression;
    if (updates.cronExpression && !TimezoneScheduler.isValidCronExpression(updates.cronExpression, effectiveTimezone)) {
      throw new Error(`Invalid cron expression: '${updates.cronExpression}'`);
    }

    // Recalculate nextRunAt if cron or timezone or oneTimeRunAt changed
    let nextRunAt = existing.nextRunAt;
    if (existing.scheduleType === 'recurring' && (updates.cronExpression || updates.timezone)) {
      if (effectiveCron) {
        nextRunAt = TimezoneScheduler.getNextRun(effectiveCron, effectiveTimezone);
      }
    } else if (existing.scheduleType === 'one_time' && updates.oneTimeRunAt) {
      nextRunAt = new Date(updates.oneTimeRunAt).toISOString();
    }

    // Verify delivery destination if changed
    if (updates.deliveryDestinationId) {
      const dest = await this.db.getDeliveryDestinationById(updates.deliveryDestinationId, organizationId);
      if (!dest) throw new AuthorizationError(`Delivery destination '${updates.deliveryDestinationId}' not found.`);
      assertTenantScope(organizationId, dest.organizationId, 'DeliveryDestination');
    }

    // Verify bi connection if changed
    if (updates.biConnectionId) {
      const conn = await this.db.getBiConnectionById(updates.biConnectionId, organizationId);
      if (!conn) throw new AuthorizationError(`BI connection '${updates.biConnectionId}' not found.`);
      assertTenantScope(organizationId, conn.organizationId, 'BiConnection');
    }

    const payload: Partial<ScheduleRecord> = {
      ...updates,
      timezone: effectiveTimezone,
      cronExpression: effectiveCron,
      nextRunAt,
    };
    if (updates.isEnabled !== undefined) {
      payload.status = updates.isEnabled ? 'active' : 'paused';
    }

    await this.db.updateSchedule(scheduleId, payload);
    const updated = (await this.db.getScheduleById(scheduleId, organizationId))!;

    await this.db.createAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      organizationId,
      userId,
      action: 'schedule:updated',
      resourceType: 'schedule',
      resourceId: scheduleId,
      detailsJson: JSON.stringify(updates),
    });

    return updated;
  }

  /**
   * Deletes a schedule within tenant boundary.
   */
  async deleteSchedule(scheduleId: string, organizationId: string, userId: string): Promise<boolean> {
    const existing = await this.db.getScheduleById(scheduleId, organizationId);
    if (!existing) {
      throw new AuthorizationError(`Schedule '${scheduleId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, existing.organizationId, 'Schedule');

    const ok = await this.db.deleteSchedule(scheduleId, organizationId);
    if (ok) {
      await this.db.createAuditLog({
        id: `audit_${crypto.randomUUID()}`,
        organizationId,
        userId,
        action: 'schedule:deleted',
        resourceType: 'schedule',
        resourceId: scheduleId,
        detailsJson: JSON.stringify({ name: existing.name }),
      });
    }
    return ok;
  }

  /**
   * Lists all execution runs for a given schedule.
   */
  async listScheduleRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]> {
    const schedule = await this.db.getScheduleById(scheduleId, organizationId);
    if (!schedule) {
      throw new AuthorizationError(`Schedule '${scheduleId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, schedule.organizationId, 'Schedule');

    return this.db.listScheduleRuns(scheduleId, organizationId);
  }
}
