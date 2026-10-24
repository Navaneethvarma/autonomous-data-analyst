import type { RouteHandler } from '../types.js';
import { assertPermission } from '../../lib/auth/rbac.js';

export const handleAuditRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, urlObj, repositories, getAuthContext, sendJson } = ctx;
  const auditRepo = repositories.audit;

  if (pathname === '/api/audit/logs' && req.method === 'GET') {
    const auth = await getAuthContext();
    assertPermission(auth.role, 'org:manage_members');
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 100);
    const logs = await auditRepo.listForOrganization(auth.organization.id, limit);
    sendJson(200, { logs });
    return true;
  }

  return false;
};
