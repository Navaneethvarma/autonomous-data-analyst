import type { DatabaseAdapter } from '../types.js';

/**
 * Base repository encapsulating access to the underlying DatabaseAdapter contract.
 */
export abstract class BaseRepository {
  constructor(protected readonly db: DatabaseAdapter) {}
}
