import { QueryTimeoutError } from '../analytics/duckdb-engine.js';
import { SqlSecurityError, SqlSyntaxError } from '../analytics/sql-validator.js';

/**
 * Determines if an execution error is transient (e.g. timeout, temporary resource lock)
 * or permanent (syntax error, security/authorization violation, schema defect).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof SqlSecurityError || err instanceof SqlSyntaxError) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Permanent safety, syntax, schema, and authorization errors must NEVER be retried
  if (
    lower.includes('prohibited') ||
    lower.includes('unauthorized') ||
    lower.includes('security') ||
    lower.includes('syntax') ||
    lower.includes('binder error') ||
    lower.includes('catalog error') ||
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('access denied') ||
    lower.includes('path traversal') ||
    lower.includes('disallowed') ||
    lower.includes('validation failed') ||
    lower.includes('execution policy rejection')
  ) {
    return false;
  }

  // Transient errors eligible for bounded retries
  if (
    err instanceof QueryTimeoutError ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('temporarily unavailable')
  ) {
    return true;
  }

  return false;
}
