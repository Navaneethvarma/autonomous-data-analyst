import type { RouteHandler } from '../types.js';
import crypto from 'node:crypto';
import { assertPermission } from '../../lib/auth/rbac.js';
import { encryptSecret } from '../../lib/security/encryption.js';
import type { DeliveryDestinationType } from '../../types/delivery.types.js';

export const handleDeliveryRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, repositories, parseJsonBody, getAuthContext, sendJson } = ctx;
  const deliveryRepo = repositories.delivery;

  if (pathname === '/api/delivery/destinations') {
    const auth = await getAuthContext();

    if (req.method === 'GET') {
      assertPermission(auth.role, 'delivery:read');
      const destinations = await deliveryRepo.listForOrganization(auth.organization.id);
      const sanitized = destinations.map(d => ({
        ...d,
        encryptedSecret: undefined,
        hasSecret: !!d.encryptedSecret,
      }));
      sendJson(200, { destinations: sanitized });
      return true;
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
      const dest = await deliveryRepo.create({
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
      return true;
    }
  }

  const deliveryDetailMatch = pathname.match(/^\/api\/delivery\/destinations\/([a-zA-Z0-9_\-]+)$/);
  if (deliveryDetailMatch && deliveryDetailMatch[1]) {
    const destId = deliveryDetailMatch[1];
    const auth = await getAuthContext();

    if (req.method === 'GET') {
      assertPermission(auth.role, 'delivery:read');
      const dest = await deliveryRepo.findById(destId, auth.organization.id);
      if (!dest) {
        sendJson(404, { error: 'Delivery destination not found' });
        return true;
      }
      sendJson(200, {
        destination: {
          ...dest,
          encryptedSecret: undefined,
          hasSecret: !!dest.encryptedSecret,
        },
      });
      return true;
    }

    if (req.method === 'DELETE') {
      assertPermission(auth.role, 'delivery:manage');
      const deleted = await deliveryRepo.delete(destId, auth.organization.id);
      sendJson(200, { success: deleted });
      return true;
    }
  }

  return false;
};
