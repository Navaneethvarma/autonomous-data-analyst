import type { RouteHandler } from '../types.js';
import { assertPermission } from '../../lib/auth/rbac.js';
import type { ExportReportFormat } from '../../types/scheduler.types.js';

export const handleSchedulerRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, repositories, services, parseJsonBody, getAuthContext, sendJson } = ctx;
  const { schedule: scheduleService, schedulerDaemon } = services;
  const scheduleRepo = repositories.schedule;

  if (pathname === '/api/schedules') {
    const auth = await getAuthContext();

    if (req.method === 'GET') {
      assertPermission(auth.role, 'schedule:read');
      const schedules = await scheduleRepo.listForOrganization(auth.organization.id);
      sendJson(200, { schedules });
      return true;
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
      return true;
    }
  }

  const scheduleDetailMatch = pathname.match(/^\/api\/schedules\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
  if (scheduleDetailMatch && scheduleDetailMatch[1]) {
    const scheduleId = scheduleDetailMatch[1];
    const subAction = scheduleDetailMatch[2];
    const auth = await getAuthContext();

    if (!subAction && req.method === 'GET') {
      assertPermission(auth.role, 'schedule:read');
      const schedule = await scheduleRepo.findById(scheduleId, auth.organization.id);
      if (!schedule) {
        sendJson(404, { error: 'Schedule not found' });
        return true;
      }
      sendJson(200, { schedule });
      return true;
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
      return true;
    }

    if (!subAction && req.method === 'DELETE') {
      assertPermission(auth.role, 'schedule:manage');
      const deleted = await scheduleService.deleteSchedule(
        scheduleId,
        auth.organization.id,
        auth.user.id
      );
      sendJson(200, { success: deleted });
      return true;
    }

    if (subAction === 'trigger' && req.method === 'POST') {
      assertPermission(auth.role, 'schedule:manage');
      const schedule = await scheduleRepo.findById(scheduleId, auth.organization.id);
      if (!schedule) {
        sendJson(404, { error: 'Schedule not found' });
        return true;
      }
      const dispatched = await schedulerDaemon.dispatchSchedule(schedule, new Date().toISOString());
      sendJson(200, {
        success: dispatched,
        message: dispatched
          ? 'Schedule triggered successfully'
          : 'Schedule reached concurrency limit or in-flight',
      });
      return true;
    }

    if (subAction === 'runs' && req.method === 'GET') {
      assertPermission(auth.role, 'schedule:read');
      const runs = await scheduleService.listScheduleRuns(scheduleId, auth.organization.id);
      sendJson(200, { runs });
      return true;
    }
  }

  return false;
};
