import type { RouteHandler } from '../types.js';
import crypto from 'node:crypto';
import { assertPermission } from '../../lib/auth/rbac.js';
import { encryptSecret } from '../../lib/security/encryption.js';
import type { BiPlatformType } from '../../types/bi.types.js';

export const handleBiRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, repositories, services, parseJsonBody, getAuthContext, sendJson } = ctx;
  const { bi: biService } = services;
  const biRepo = repositories.bi;

  if (pathname === '/api/bi/connections') {
    const auth = await getAuthContext();

    if (req.method === 'GET') {
      assertPermission(auth.role, 'bi:read');
      const connections = await biRepo.listForOrganization(auth.organization.id);
      const sanitized = connections.map(c => ({
        ...c,
        encryptedCredentials: undefined,
      }));
      sendJson(200, { connections: sanitized });
      return true;
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

      const conn = await biRepo.create({
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
      return true;
    }
  }

  const biDetailMatch = pathname.match(/^\/api\/bi\/connections\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
  if (biDetailMatch && biDetailMatch[1]) {
    const connId = biDetailMatch[1];
    const subAction = biDetailMatch[2];
    const auth = await getAuthContext();

    if (!subAction && req.method === 'GET') {
      assertPermission(auth.role, 'bi:read');
      const conn = await biRepo.findById(connId, auth.organization.id);
      if (!conn) {
        sendJson(404, { error: 'BI connection not found' });
        return true;
      }
      sendJson(200, {
        connection: {
          ...conn,
          encryptedCredentials: undefined,
        },
      });
      return true;
    }

    if (!subAction && req.method === 'DELETE') {
      assertPermission(auth.role, 'bi:manage');
      const deleted = await biRepo.delete(connId, auth.organization.id);
      sendJson(200, { success: deleted });
      return true;
    }

    if (subAction === 'test' && req.method === 'POST') {
      assertPermission(auth.role, 'bi:manage');
      const resTest = await biService.testConnection(connId, auth.organization.id);
      sendJson(200, resTest);
      return true;
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
      return true;
    }
  }

  return false;
};
