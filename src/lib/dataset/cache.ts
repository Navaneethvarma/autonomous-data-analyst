import fs from 'node:fs';
import type { DatasetProfile } from './types.js';

interface CacheEntry {
  profile: DatasetProfile;
  mtimeMs: number;
  sizeBytes: number;
}

class DatasetProfileCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Retrieves a cached profile if the file exists and has not been modified since caching.
   */
  get(resolvedPath: string): DatasetProfile | null {
    const entry = this.cache.get(resolvedPath);
    if (!entry) return null;

    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.mtimeMs === entry.mtimeMs && stats.size === entry.sizeBytes) {
        return entry.profile;
      }
      // Stale entry - invalidate
      this.cache.delete(resolvedPath);
      return null;
    } catch {
      this.cache.delete(resolvedPath);
      return null;
    }
  }

  /**
   * Caches a profile with current file metadata.
   */
  set(resolvedPath: string, profile: DatasetProfile): void {
    try {
      const stats = fs.statSync(resolvedPath);
      this.cache.set(resolvedPath, {
        profile,
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.size,
      });
    } catch {
      // If stats cannot be read, do not cache
    }
  }

  /**
   * Clears the cache (primarily for tests).
   */
  clear(): void {
    this.cache.clear();
  }
}

export const datasetProfileCache = new DatasetProfileCache();
