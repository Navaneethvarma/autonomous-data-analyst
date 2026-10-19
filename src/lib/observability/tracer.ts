import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  TraceSpan,
  WorkflowTrace,
  TraceStatus,
  FailureCategory,
} from './types.js';

/**
 * KNOWN LIMITATIONS OF REGEX & HEURISTIC REDACTION:
 * Redaction patterns provide defense-in-depth sanitization against common credential,
 * authentication token, database connection string, email, and card number disclosures.
 * However, regex-based token matching cannot guarantee 100% detection of arbitrary,
 * unstructured, or novel PII (such as person names in free text, custom proprietary keys,
 * or non-standard token formats). Telemetry collectors should enforce strict schema boundaries
 * and prevent raw user or customer data from entering trace metadata at the point of ingestion.
 */

/**
 * Redacts sensitive tokens, API credentials, passwords, and private PII.
 * Supports both string inputs and arbitrary objects/payloads.
 */
export function redactSensitiveData(raw: unknown): any {
  if (raw === null || raw === undefined) return '';

  if (typeof raw !== 'string') {
    return sanitizeObjectForTrace(raw);
  }

  let text = raw;

  // Bearer tokens (must be processed before generic keys)
  text = text.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED_BEARER_TOKEN]');

  // GitHub tokens (ghp_, gho_, github_pat_)
  text = text.replace(/gh[pousr]_[a-zA-Z0-9]{10,}/gi, '[REDACTED_API_KEY]');
  text = text.replace(/github_pat_[a-zA-Z0-9_]{10,}/gi, '[REDACTED_API_KEY]');

  // API keys (OpenAI sk-, sk-proj-, Anthropic sk-ant-, generic keys)
  text = text.replace(/sk-(?:proj-|ant-[a-zA-Z0-9_\-]+-)?[a-zA-Z0-9_\-]{16,}/gi, '[REDACTED_API_KEY]');
  text = text.replace(/(?:api[_-]?key[:=]\s*)['"]?[a-zA-Z0-9_\-]{16,}['"]?/gi, 'api_key=[REDACTED_API_KEY]');

  // AWS Access Keys
  text = text.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_API_KEY]');

  // Slack tokens
  text = text.replace(/\b(xox[baprs]-[0-9a-zA-Z-]{10,})\b/g, '[REDACTED_API_KEY]');

  // Database connection string passwords (URL style: postgres://user:password@host, mongodb://..., etc.)
  text = text.replace(/([a-zA-Z0-9+.-]+:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED_PASSWORD]$3');

  // Key-value connection string passwords (e.g. Server=...;Pwd=myPassword; or Password=...)
  text = text.replace(/(?:password|passwd|pwd)\s*=\s*['"]?[^;\s'"]+['"]?/gi, 'password=[REDACTED_SECRET]');

  // Password / secret fields in query strings or JSON
  text = text.replace(/(?:password|passwd|pwd)[:=]\s*['"]?[^\s,'"]+['"]?/gi, 'password=[REDACTED_SECRET]');
  text = text.replace(/(?:secret|token|apikey|api_key)[:=]\s*['"]?[^\s,'"]+['"]?/gi, 'secret=[REDACTED_SECRET]');

  // Email addresses
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, '[REDACTED_EMAIL]');

  // Credit card numbers
  text = text.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[REDACTED_CARD_NUMBER]');

  // Control blocks and prompt injection tokens
  text = text.replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, '[REDACTED_CONTROL_BLOCK]');

  return text;
}

/**
 * Sanitizes arbitrary objects for structured logging and trace recording,
 * preventing accidental exposure of sensitive keys or raw dataset dumps.
 */
export function sanitizeObjectForTrace(input: unknown, maxDepth = 4): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return redactSensitiveData(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (maxDepth <= 0) return '[MAX_DEPTH_REACHED]';

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactSensitiveData(input.message),
      stack: input.stack ? (redactSensitiveData(input.stack) as string) : undefined,
    };
  }

  if (Array.isArray(input)) {
    // Large raw data arrays are summarized to prevent telemetry pollution
    if (input.length > 5) {
      return `[REDACTED_DATA_ROWS: ${input.length} rows omitted for privacy]`;
    }
    return input.map((item) => sanitizeObjectForTrace(item, maxDepth - 1));
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('credential')
      ) {
        sanitized[key] = '[REDACTED_CREDENTIAL]';
      } else if (
        lowerKey === 'rows' ||
        lowerKey === 'rawresults' ||
        lowerKey === 'records' ||
        lowerKey === 'datasetrows' ||
        lowerKey === 'samplerows'
      ) {
        // Unrestricted dataset rows must NEVER be persisted in telemetry traces
        const count = Array.isArray(val) ? val.length : 0;
        sanitized[key] = `[REDACTED_DATA_ROWS: ${count} rows omitted for privacy]`;
      } else if (
        lowerKey === 'parameters' ||
        lowerKey === 'params' ||
        lowerKey === 'sqlparameters' ||
        lowerKey === 'queryparameters'
      ) {
        // Redact unrestricted SQL parameters
        if (Array.isArray(val)) {
          if (val.length > 5) {
            sanitized[key] = `[SQL_PARAMETERS: ${val.length} parameters redacted for privacy]`;
          } else {
            sanitized[key] = val.map((param) => {
              if (typeof param === 'number' || typeof param === 'boolean') return param;
              if (typeof param === 'string') {
                const redacted = redactSensitiveData(param);
                const lower = param.toLowerCase();
                if (
                  lower.includes('secret') ||
                  lower.includes('password') ||
                  lower.includes('passwd') ||
                  lower.includes('token') ||
                  lower.includes('key')
                ) {
                  return '[REDACTED_PARAM]';
                }
                return redacted;
              }
              return '[REDACTED_PARAM]';
            });
          }
        } else {
          sanitized[key] = sanitizeObjectForTrace(val, maxDepth - 1);
        }
      } else if (lowerKey === 'stack' || lowerKey === 'stacktrace') {
        sanitized[key] = typeof val === 'string' ? redactSensitiveData(val) : '[REDACTED_STACK_TRACE]';
      } else {
        sanitized[key] = sanitizeObjectForTrace(val, maxDepth - 1);
      }
    }
    return sanitized;
  }

  return String(input);
}

/**
 * Generates a deterministic schema fingerprint from column names and inferred types.
 */
export function computeSchemaFingerprint(columns: Array<{ name: string; inferredType: string }>): string {
  const schemaStr = columns
    .map((c) => `${c.name.trim().toLowerCase()}:${c.inferredType.toLowerCase()}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(schemaStr).digest('hex').substring(0, 16);
}

/**
 * Correlated execution tracer capturing stage events, timing, retries, and errors.
 */
export class WorkflowTracer {
  private trace: WorkflowTrace;
  private activeSpans: Map<string, { span: TraceSpan; startHighRes: [number, number] }> = new Map();

  constructor(userQuery: string, workflowId = 'analytical-workflow', datasetPath?: string) {
    const traceId = `trc_${crypto.randomUUID()}`;
    const runId = `run_${crypto.randomUUID()}`;

    this.trace = {
      traceId,
      runId,
      workflowId,
      datasetPath,
      userQuery: redactSensitiveData(userQuery) as string,
      startTime: new Date().toISOString(),
      finalStatus: 'completed',
      spans: [],
    };
  }

  public getTraceId(): string {
    return this.trace.traceId;
  }

  public getRunId(): string {
    return this.trace.runId;
  }

  public setSchemaFingerprint(fingerprint: string): void {
    this.trace.schemaFingerprint = fingerprint;
  }

  public startSpan(stageName: string, toolName?: string, metadata: Record<string, unknown> = {}): TraceSpan {
    const spanId = `spn_${crypto.randomUUID()}`;
    const span: TraceSpan = {
      spanId,
      traceId: this.trace.traceId,
      runId: this.trace.runId,
      stageName,
      status: 'started',
      startTime: new Date().toISOString(),
      retryCount: 0,
      failureCategory: 'none',
      toolName,
      metadata: sanitizeObjectForTrace(metadata) as Record<string, unknown>,
      redactedErrors: [],
    };

    this.activeSpans.set(spanId, {
      span,
      startHighRes: process.hrtime(),
    });

    return span;
  }

  public completeSpan(spanOrId: string | TraceSpan, extraMetadata?: Record<string, unknown>): TraceSpan | undefined {
    const spanId = typeof spanOrId === 'string' ? spanOrId : spanOrId.spanId;
    return this.endSpan(spanId, 'completed', 'none', extraMetadata);
  }

  public failSpan(
    spanOrId: string | TraceSpan,
    error: string,
    failureCategory: FailureCategory = 'internal_error'
  ): TraceSpan | undefined {
    const spanId = typeof spanOrId === 'string' ? spanOrId : spanOrId.spanId;
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      entry.span.redactedErrors.push(redactSensitiveData(error) as string);
    }
    return this.endSpan(spanId, 'failed', failureCategory, { error: redactSensitiveData(error) });
  }

  public warnSpan(spanOrId: string | TraceSpan, warning: string, extraMetadata?: Record<string, unknown>): TraceSpan | undefined {
    const spanId = typeof spanOrId === 'string' ? spanOrId : spanOrId.spanId;
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      entry.span.redactedErrors.push(redactSensitiveData(warning) as string);
    }
    return this.endSpan(spanId, 'warning', 'none', extraMetadata);
  }

  public recordSpanRetry(spanOrId: string | TraceSpan, failureCategory: FailureCategory, reason: string): void {
    const spanId = typeof spanOrId === 'string' ? spanOrId : spanOrId.spanId;
    const entry = this.activeSpans.get(spanId);
    if (!entry) return;

    entry.span.retryCount += 1;
    entry.span.status = 'retrying';
    entry.span.failureCategory = failureCategory;
    entry.span.redactedErrors.push(redactSensitiveData(reason) as string);
  }

  public endSpan(
    spanOrId: string | TraceSpan,
    status: TraceStatus = 'completed',
    failureCategory: FailureCategory = 'none',
    extraMetadata?: Record<string, unknown>
  ): TraceSpan | undefined {
    const spanId = typeof spanOrId === 'string' ? spanOrId : spanOrId.spanId;
    const entry = this.activeSpans.get(spanId);
    if (!entry) return undefined;

    const diff = process.hrtime(entry.startHighRes);
    const durationMs = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 100) / 100;

    entry.span.status = status;
    entry.span.failureCategory = failureCategory;
    entry.span.endTime = new Date().toISOString();
    entry.span.durationMs = durationMs;

    if (extraMetadata) {
      entry.span.metadata = {
        ...entry.span.metadata,
        ...(sanitizeObjectForTrace(extraMetadata) as Record<string, unknown>),
      };
    }

    this.trace.spans.push(entry.span);
    this.activeSpans.delete(spanId);
    return entry.span;
  }

  public finishTrace(
    finalStatus: WorkflowTrace['finalStatus'],
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    modelLatencyMs?: number
  ): WorkflowTrace {
    // Close any unclosed spans
    for (const [spanId] of this.activeSpans) {
      this.endSpan(spanId, 'failed', 'internal_error', { reason: 'Span forcefully closed on trace completion' });
    }

    this.trace.finalStatus = finalStatus;
    this.trace.endTime = new Date().toISOString();
    this.trace.tokenUsage = tokenUsage;
    this.trace.modelLatencyMs = modelLatencyMs;

    const start = new Date(this.trace.startTime).getTime();
    const end = new Date(this.trace.endTime).getTime();
    this.trace.totalDurationMs = Math.max(0, end - start);

    return this.trace;
  }

  public finalizeTrace(
    finalStatus: WorkflowTrace['finalStatus'],
    summary?: string
  ): WorkflowTrace {
    if (summary) {
      this.trace.summary = redactSensitiveData(summary) as string;
    }
    return this.finishTrace(finalStatus);
  }

  public getTraceSnapshot(): WorkflowTrace {
    return JSON.parse(JSON.stringify(this.trace));
  }

  public getSerializedTrace(): string {
    return serializeTrace(this.trace);
  }

  public persist(tracesDir?: string): string {
    return persistTrace(this.trace, { tracesDir });
  }
}

/**
 * Serializes a complete workflow trace to a JSON string with comprehensive privacy sanitization.
 */
export function serializeTrace(trace: WorkflowTrace): string {
  const sanitized = sanitizeObjectForTrace(trace) as WorkflowTrace;
  return JSON.stringify(sanitized, null, 2);
}

/**
 * Persists a sanitized workflow trace to disk.
 */
export function persistTrace(
  trace: WorkflowTrace,
  options: { tracesDir?: string; filePath?: string } = {}
): string {
  const defaultDir = path.resolve(process.cwd(), 'reports', 'traces');
  const targetDir = options.tracesDir ?? defaultDir;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = options.filePath ?? path.join(targetDir, `${trace.traceId}.json`);
  const serialized = serializeTrace(trace);
  fs.writeFileSync(targetFile, serialized, 'utf-8');
  return targetFile;
}
