import type { RequestContext, RouteHandler } from '../types.js';
import { handleHealthRoutes } from './health.routes.js';
import { handleAuthRoutes } from './auth.routes.js';
import { handleDatasetRoutes } from './dataset.routes.js';
import { handleAnalysisRoutes } from './analysis.routes.js';
import { handleSchedulerRoutes } from './scheduler.routes.js';
import { handleDeliveryRoutes } from './delivery.routes.js';
import { handleBiRoutes } from './bi.routes.js';
import { handleAuditRoutes } from './audit.routes.js';

export const routeHandlers: RouteHandler[] = [
  handleHealthRoutes,
  handleAuthRoutes,
  handleDatasetRoutes,
  handleAnalysisRoutes,
  handleSchedulerRoutes,
  handleDeliveryRoutes,
  handleBiRoutes,
  handleAuditRoutes,
];

/**
 * Dispatches an incoming request context through registered domain route handlers.
 * Returns true if a route handled the request; false if not found.
 */
export async function dispatchRoutes(ctx: RequestContext): Promise<boolean> {
  for (const handler of routeHandlers) {
    const handled = await handler(ctx);
    if (handled) {
      return true;
    }
  }
  return false;
}
