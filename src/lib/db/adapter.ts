/**
 * Backward compatibility facade for database exports.
 * Concrete implementations and lifecycle management have moved to:
 * - `types.ts`: database interfaces and contracts
 * - `memory-adapter.ts`: in-memory implementation
 * - `postgres-adapter.ts`: PostgreSQL implementation
 * - `index.ts`: factory, active adapter lifecycle, and unified re-exports
 */

export * from './index.js';
