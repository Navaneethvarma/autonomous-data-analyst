import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { AnalyticalWorkflowOrchestrator } from '../../src/lib/workflow/orchestrator.js';
import { WorkflowResultSchema } from '../../src/lib/workflow/types.js';

describe('Analytical Workflow Orchestrator (Milestone 10)', () => {
  const sampleSalesPath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');
  const orchestrator = new AnalyticalWorkflowOrchestrator();

  it('executes a complete end-to-end analytical workflow with DuckDB and artifacts', async () => {
    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our gross revenue across product categories?',
      datasetPath: sampleSalesPath,
      executionEngine: 'duckdb',
      generateArtifacts: {
        dashboard: true,
        report: false,
      },
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.inspectionSummary).not.toBeNull();
    expect(result.inspectionSummary?.rowCount).toBeGreaterThan(0);
    expect(result.schemaFingerprint).toMatch(/^[a-f0-9]{16}$/);

    // Semantic resolution check
    expect(result.semanticResolution).not.toBeNull();
    expect(result.semanticResolution?.status).toBe('resolved');
    expect(result.semanticResolution?.resolvedMetric?.metricId).toBe('metric_gross_revenue');
    expect(result.retrievedCitations.length).toBeGreaterThan(0);

    // Plan check
    expect(result.analyticalPlan).not.toBeNull();
    expect(result.analyticalPlan?.requiredColumns).toContain('unit_price');
    expect(result.analyticalPlan?.requiredColumns).toContain('quantity');

    // Execution check
    expect(result.executionResult).not.toBeNull();
    expect(result.executionResult?.engineUsed).toBe('duckdb');
    expect(result.executionResult?.rows).toBeDefined();
    expect(result.executionResult?.rowCount).toBeGreaterThan(0);

    // Validation check
    expect(result.validationResult).not.toBeNull();
    expect(result.validationResult?.isValid).toBe(true);

    // Insights check
    expect(result.insights.length).toBeGreaterThan(0);

    // Artifacts check
    expect(result.generatedArtifacts.dashboardSpecGenerated).toBe(true);

    // Observability & Provenance check
    expect(result.trace).toBeDefined();
    expect(result.trace.spans.length).toBeGreaterThanOrEqual(6);
    expect(result.trace.finalStatus).toBe('completed');
    const spanStages = result.trace.spans.map((s) => s.stageName);
    expect(spanStages).toContain('inspection');
    expect(spanStages).toContain('semantic_resolution');
    expect(spanStages).toContain('planning');
    expect(spanStages).toContain('execution');
    expect(spanStages).toContain('validation');
    expect(spanStages).toContain('insight_generation');

    // Schema parse
    const parsed = WorkflowResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('halts execution cleanly when user concept is ambiguous', async () => {
    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our revenue?',
      datasetPath: sampleSalesPath,
    });

    expect(result.status).toBe('ambiguity_clarification_needed');
    expect(result.clarificationQuestion).not.toBeNull();
    expect(result.clarificationQuestion).toContain('Gross Revenue');
    expect(result.semanticResolution?.status).toBe('ambiguous');

    // Execution must NOT run or fabricate answers
    expect(result.executionResult).toBeNull();
    expect(result.analyticalPlan).toBeNull();
    expect(result.insights).toHaveLength(0);
    expect(result.trace.finalStatus).toBe('ambiguity_clarification_needed');
  });

  it('halts with incompatible_schema when dataset lacks required columns', async () => {
    const m4Path = path.resolve(process.cwd(), 'datasets', 'm4_execution_test.csv');
    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our gross revenue?',
      datasetPath: m4Path,
    });

    expect(result.status).toBe('incompatible_schema');
    expect(result.semanticResolution?.status).toBe('incompatible_schema');
    expect(result.executionResult).toBeNull();
  });

  it('labels unapproved exploratory concepts and includes governance warnings', async () => {
    const result = await orchestrator.executeWorkflow({
      userQuery: 'Calculate customer churn rate',
      datasetPath: sampleSalesPath,
    });

    expect(result.status).toBe('unresolved_exploratory');
    expect(result.semanticResolution?.status).toBe('unresolved_exploratory');
    expect(result.warnings.some((w) => w.includes('exploratory') || w.includes('No approved business metric'))).toBe(true);
  });

  it('executes sandboxed Python analysis when requested', async () => {
    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our gross revenue across product categories?',
      datasetPath: sampleSalesPath,
      executionEngine: 'python',
    });

    expect(result.status).toBe('completed');
    expect(result.executionResult).not.toBeNull();
    expect(result.executionResult?.engineUsed).toBe('python');
    expect(result.executionResult?.rowCount).toBeGreaterThan(0);
  }, 20000);

  it('preserves validated analytical results when artifact generation fails (partial failure)', async () => {
    // We pass an unwriteable directory for the report PDF to trigger artifact failure
    const nonExistentPath = 'Z:\\non_existent_drive\\invalid_dir\\report.pdf';

    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our gross revenue across product categories?',
      datasetPath: sampleSalesPath,
      executionEngine: 'duckdb',
      generateArtifacts: {
        dashboard: false,
        report: true,
        reportTitle: nonExistentPath, // Will fail write
      },
    });

    // The analytical execution must remain preserved
    expect(result.executionResult).not.toBeNull();
    expect(result.executionResult?.rowCount).toBeGreaterThan(0);
    expect(result.validationResult?.isValid).toBe(true);
    expect(result.insights.length).toBeGreaterThan(0);

    // Status reflects partial failure rather than silent fabrication
    expect(['completed', 'partial_success_artifact_failed']).toContain(result.status);
    expect(result.trace.spans.some((s) => s.stageName === 'artifact_generation')).toBe(true);
  });

  it('preserves trace provenance continuity across all stages', async () => {
    const result = await orchestrator.executeWorkflow({
      userQuery: 'What is our gross revenue across product categories?',
      datasetPath: sampleSalesPath,
    });

    const traceId = result.traceId;
    const runId = result.runId;
    expect(traceId).toBe(result.trace.traceId);
    expect(runId).toBe(result.trace.runId);

    for (const span of result.trace.spans) {
      expect(span.traceId).toBe(traceId);
      expect(span.runId).toBe(runId);
      expect(span.startTime).toBeDefined();
    }
  });
});
