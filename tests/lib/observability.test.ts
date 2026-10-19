import { describe, it, expect } from 'vitest';
import {
  WorkflowTracer,
  redactSensitiveData,
  computeSchemaFingerprint,
} from '../../src/lib/observability/tracer.js';
import { WorkflowTraceSchema } from '../../src/lib/observability/types.js';

describe('Observability & Tracing Subsystem (Milestone 10)', () => {
  it('creates and tracks spans with durations and timestamps', async () => {
    const tracer = new WorkflowTracer('What is gross revenue?', 'test-workflow', 'datasets/sample_sales.csv');
    expect(tracer.getTraceId()).toMatch(/^trc_[a-f0-9-]+$/);
    expect(tracer.getRunId()).toMatch(/^run_[a-f0-9-]+$/);

    const span = tracer.startSpan('inspection', 'profileDataset', { sample: 123 });
    expect(span.stageName).toBe('inspection');
    expect(span.toolName).toBe('profileDataset');
    expect(span.status).toBe('started');

    // Small delay to verify duration
    await new Promise((resolve) => setTimeout(resolve, 20));

    tracer.completeSpan(span.spanId, { columnsFound: 5 });
    expect(span.status).toBe('completed');
    expect(span.durationMs).toBeGreaterThanOrEqual(15);
    expect(span.metadata.columnsFound).toBe(5);

    const trace = tracer.finalizeTrace('completed', 'Final summary');
    expect(trace.finalStatus).toBe('completed');
    expect(trace.spans).toHaveLength(1);
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(15);

    const parsed = WorkflowTraceSchema.safeParse(trace);
    expect(parsed.success).toBe(true);
  });

  it('records failed spans with failure category and redacted error message', () => {
    const tracer = new WorkflowTracer('Query with error', 'test-workflow');
    const span = tracer.startSpan('execution', 'executeAnalyticalQuery');

    tracer.failSpan(
      span.spanId,
      'Connection failed with password=super_secret_pass and sk-ant-api03-1234567890abcdef',
      'syntax_or_safety_violation'
    );

    expect(span.status).toBe('failed');
    expect(span.failureCategory).toBe('syntax_or_safety_violation');
    expect(span.redactedErrors).toHaveLength(1);
    expect(span.redactedErrors[0]).not.toContain('super_secret_pass');
    expect(span.redactedErrors[0]).not.toContain('sk-ant-api03-1234567890abcdef');
    expect(span.redactedErrors[0]).toContain('[REDACTED_API_KEY]');
  });

  describe('Sensitive Data Redaction', () => {
    it('redacts Anthropic, OpenAI, and GitHub API keys', () => {
      const text = 'Here is sk-ant-api03-abcdef1234567890 and sk-proj-1234567890abcdefghij and ghp_abcdef1234567890';
      const redacted = redactSensitiveData(text);
      expect(redacted).not.toContain('sk-ant-api03');
      expect(redacted).not.toContain('sk-proj-');
      expect(redacted).not.toContain('ghp_');
      expect(redacted).toContain('[REDACTED_API_KEY]');
    });

    it('redacts Bearer authentication tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const redacted = redactSensitiveData(text);
      expect(redacted).toContain('Bearer [REDACTED_BEARER_TOKEN]');
      expect(redacted).not.toContain('eyJhbGci');
    });

    it('redacts email addresses to protect PII', () => {
      const text = 'Customer John Doe (john.doe@company.org) made a purchase';
      const redacted = redactSensitiveData(text);
      expect(redacted).toContain('[REDACTED_EMAIL]');
      expect(redacted).not.toContain('john.doe@company.org');
    });

    it('redacts password parameters in database connection strings and payloads', () => {
      const text = 'postgres://user:super_secret_pwd@localhost:5432/db?token=secret123';
      const redacted = redactSensitiveData(text);
      expect(redacted).toContain('user:[REDACTED_PASSWORD]@');
      expect(redacted).not.toContain('super_secret_pwd');
    });

    it('redacts raw record arrays exceeding display limits', () => {
      const largeRows = Array.from({ length: 50 }, (_, i) => ({ id: i, value: `val_${i}` }));
      const payload = {
        meta: 'ok',
        rows: largeRows,
      };
      const redacted = redactSensitiveData(payload);
      expect(redacted.rows).toBe('[REDACTED_DATA_ROWS: 50 rows omitted for privacy]');
    });
  });

  describe('Deterministic Schema Fingerprinting', () => {
    it('generates consistent, invariant hash regardless of column definition order', () => {
      const colsA = [
        { name: 'category', inferredType: 'string' },
        { name: 'revenue', inferredType: 'number' },
      ];
      const colsB = [
        { name: 'revenue', inferredType: 'number' },
        { name: 'category', inferredType: 'string' },
      ];

      const hashA = computeSchemaFingerprint(colsA);
      const hashB = computeSchemaFingerprint(colsB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{16}$/);
    });

    it('produces different hashes for different column types or names', () => {
      const colsA = [{ name: 'revenue', inferredType: 'number' }];
      const colsB = [{ name: 'revenue', inferredType: 'string' }];

      expect(computeSchemaFingerprint(colsA)).not.toBe(computeSchemaFingerprint(colsB));
    });
  });
});
