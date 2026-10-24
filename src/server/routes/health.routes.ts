import type { RouteHandler } from '../types.js';

export const handleHealthRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, db, services, sendJson } = ctx;

  if (pathname === '/api/health' && req.method === 'GET') {
    const dbHealth = await db.checkHealth();
    sendJson(dbHealth.ok ? 200 : 503, {
      status: dbHealth.ok ? 'healthy' : 'degraded',
      database: dbHealth.ok ? 'connected' : 'error',
      queue: services.queue.isReady() ? 'ready' : 'in-memory',
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  return false;
};
