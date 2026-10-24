import type duckdb from 'duckdb';

export interface DuckDbColumnInfo {
  name: string;
  type: string;
  nullCount: number;
}

export type DbRunner = (sql: string, params?: unknown[]) => Promise<duckdb.TableData>;

/**
 * Normalizes number values, converting NaN or infinite values to null.
 */
export function cleanNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    if (Number.isNaN(val) || !Number.isFinite(val)) return null;
    return Number(val.toFixed(4));
  }
  if (typeof val === 'bigint') {
    return Number(val);
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return Number(num.toFixed(4));
    }
  }
  return null;
}

/**
 * Classifies DuckDB column type string into simplified analytical domain category.
 */
export function classifyType(typeStr: string): 'numeric' | 'temporal' | 'categorical' {
  const upper = typeStr.toUpperCase();
  if (
    upper.includes('INT') ||
    upper.includes('DOUBLE') ||
    upper.includes('FLOAT') ||
    upper.includes('DECIMAL') ||
    upper.includes('REAL') ||
    upper.includes('NUMERIC')
  ) {
    return 'numeric';
  }
  if (
    upper.includes('DATE') ||
    upper.includes('TIMESTAMP') ||
    upper.includes('TIME')
  ) {
    return 'temporal';
  }
  return 'categorical';
}

/**
 * Escapes SQL identifier for safe DuckDB querying.
 */
export function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
