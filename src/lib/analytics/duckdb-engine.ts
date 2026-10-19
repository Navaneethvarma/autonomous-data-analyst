import duckdb from 'duckdb';
import path from 'node:path';
import { validateAndResolveDatasetPath } from '../dataset/validator.js';
import { validateReadOnlySql } from './sql-validator.js';
import {
  AnalyticalQueryInputSchema,
  type AnalyticalQueryInput,
  type AnalyticalQueryResult,
  type QueryParameterValue,
} from './types.js';

export class QueryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

export class QueryExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

/**
 * Normalizes values returned by DuckDB (e.g. converting BigInt to Number/String).
 */
function serializeValue(val: unknown): unknown {
  if (typeof val === 'bigint') {
    if (val <= BigInt(Number.MAX_SAFE_INTEGER) && val >= BigInt(Number.MIN_SAFE_INTEGER)) {
      return Number(val);
    }
    return val.toString();
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }
  if (val !== null && typeof val === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeValue(v);
    }
    return res;
  }
  return val;
}

/**
 * Executes a read-only analytical query against a validated CSV or Parquet dataset using DuckDB.
 */
export async function executeAnalyticalQuery(
  input: AnalyticalQueryInput,
  options: { customBaseDir?: string } = {}
): Promise<AnalyticalQueryResult> {
  const startTime = Date.now();

  const parsedInput = AnalyticalQueryInputSchema.parse(input);

  // 1. Resolve and validate dataset path
  const { resolvedPath, sanitizedName } = validateAndResolveDatasetPath(
    parsedInput.datasetPath,
    options.customBaseDir
  );

  const tableAlias = parsedInput.tableAlias || 'dataset';
  const rowLimit = parsedInput.rowLimit || 1000;
  const timeoutMs = parsedInput.timeoutMs || 15000;

  // 2. Validate SQL query before initializing database session
  const { sanitizedSql } = validateReadOnlySql(parsedInput.sql, [tableAlias]);

  // 3. Initialize isolated in-memory DuckDB instance
  const db = new duckdb.Database(':memory:', {
    max_memory: '512MB',
  });

  try {
    // 4. Materialize authorized dataset into tableAlias
    // Using forward slashes for cross-platform DuckDB SQL path parsing
    const normalizedDbPath = resolvedPath.replace(/\\/g, '/');
    const ext = path.extname(resolvedPath).toLowerCase();

    const loaderSql = ext === '.parquet'
      ? `CREATE TABLE "${tableAlias}" AS SELECT * FROM read_parquet('${normalizedDbPath}');`
      : `CREATE TABLE "${tableAlias}" AS SELECT * FROM read_csv_auto('${normalizedDbPath}', header=true, nullstr=['null', 'NULL', 'NaN', 'NA', 'n/a', 'N/A', 'None', 'none', '']);`;

    await new Promise<void>((resolve, reject) => {
      db.all(loaderSql, (err) => {
        if (err) {
          reject(new QueryExecutionError(`Failed to load dataset: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    // 5. Lockdown filesystem and external network access in DuckDB engine
    await new Promise<void>((resolve, reject) => {
      db.all('SET enable_external_access = false;', (err) => {
        if (err) {
          reject(new QueryExecutionError(`Failed to lock down external access: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    // 6. Execute validated analytical query with timeout and interrupt handling
    const queryParams: QueryParameterValue[] = parsedInput.parameters || [];

    const executionPromise = new Promise<duckdb.TableData>((resolve, reject) => {
      if (queryParams.length > 0) {
        db.all(sanitizedSql, ...queryParams, (err, res) => {
          if (err) reject(new QueryExecutionError(`DuckDB execution failed: ${err.message}`));
          else resolve(res);
        });
      } else {
        db.all(sanitizedSql, (err, res) => {
          if (err) reject(new QueryExecutionError(`DuckDB execution failed: ${err.message}`));
          else resolve(res);
        });
      }
    });

    // Timeout guard with interrupt
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        try {
          db.interrupt();
        } catch {
          // Ignore interrupt error if already terminated
        }
        reject(new QueryTimeoutError(`Query execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    let rawResults: duckdb.TableData;
    try {
      rawResults = await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const totalReturned = rawResults.length;
    const isTruncated = totalReturned > rowLimit;
    const finalRows = isTruncated ? rawResults.slice(0, rowLimit) : rawResults;

    // Serialize values (converting BigInt, etc.)
    const serializedRows = finalRows.map(row => {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        obj[key] = serializeValue(val);
      }
      return obj;
    });

    const columns = serializedRows.length > 0 ? Object.keys(serializedRows[0]!) : [];

    return {
      dataset: sanitizedName,
      sqlExecuted: sanitizedSql,
      rowCount: serializedRows.length,
      columns,
      rows: serializedRows,
      executionTimeMs,
      isTruncated,
      provenance: {
        datasetFile: sanitizedName,
        executedSql: sanitizedSql,
        executedAt: new Date().toISOString(),
        executionTimeMs,
        rowLimitApplied: rowLimit,
        isTruncated,
        engine: 'DuckDB in-memory v1.4.4',
      },
    };
  } finally {
    // 7. Always cleanly close in-memory database to release memory
    await new Promise<void>((resolve) => {
      const closeTimer = setTimeout(() => resolve(), 1000);
      db.close(() => {
        clearTimeout(closeTimer);
        resolve();
      });
    });
  }
}
