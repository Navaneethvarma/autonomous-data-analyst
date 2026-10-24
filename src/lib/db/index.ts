/**
 * Database module entrypoint.
 * Manages database adapter construction, lifecycle, and active adapter resolution.
 */

import type { DatabaseAdapter } from './types.js';
import { MemoryDbAdapter } from './memory-adapter.js';
import { PostgresAdapter } from './postgres-adapter.js';

export * from './types.js';
export { MemoryDbAdapter } from './memory-adapter.js';
export { PostgresAdapter } from './postgres-adapter.js';
export * from './repositories/index.js';

let activeAdapter: DatabaseAdapter | null = null;

/**
 * Sanitizes connection strings to prevent logging passwords in error messages.
 */
export function sanitizeConnectionString(connStr?: string): string {
  if (!connStr) return 'unknown';
  try {
    const u = new URL(connStr);
    if (u.password) {
      u.password = '***';
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return connStr.replace(/:\/\/([^:]+):.*@/, '://$1:***@');
  }
}

/**
 * Resolves or initializes the active DatabaseAdapter.
 * Fails closed in production if DATABASE_URL is missing or if MemoryDbAdapter is requested.
 */
export function getDatabaseAdapter(forceMemory = false): DatabaseAdapter {
  if (activeAdapter) return activeAdapter;

  const isProduction = process.env.NODE_ENV === 'production';
  const dbUrl = process.env.DATABASE_URL;

  if (isProduction) {
    if (forceMemory) {
      throw new Error(
        'Configuration Error: In-memory database adapter (MemoryDbAdapter) is prohibited in production mode. A persistent PostgreSQL DATABASE_URL is mandatory.'
      );
    }
    if (!dbUrl) {
      throw new Error(
        'Configuration Error: Missing DATABASE_URL. In production mode, PostgreSQL is mandatory for durable application records.'
      );
    }
    activeAdapter = new PostgresAdapter(dbUrl);
    return activeAdapter;
  }

  // Development and test environments
  if (!forceMemory && dbUrl && process.env.NODE_ENV !== 'test') {
    activeAdapter = new PostgresAdapter(dbUrl);
  } else {
    activeAdapter = new MemoryDbAdapter();
  }
  return activeAdapter;
}

/**
 * Sets the active DatabaseAdapter (used for tests and lifecycle management).
 */
export function setDatabaseAdapter(adapter: DatabaseAdapter | null): void {
  activeAdapter = adapter;
}
