import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runEvaluationSuite } from '../../src/lib/eval/runner.js';
import { EvaluationReportSchema } from '../../src/lib/eval/types.js';

describe('Evaluation & Benchmarking Framework (Milestone 10)', () => {
  it('runs all deterministic benchmark cases and outputs summary metrics', async () => {
    const report = await runEvaluationSuite();

    expect(report).toBeDefined();
    expect(report.summary.totalCases).toBe(12);
    expect(report.summary.passedCases).toBe(12);
    expect(report.summary.failedCases).toBe(0);
    expect(report.summary.overallPassRate).toBe(1.0);

    // Assert on key product objective evaluation metrics
    expect(report.metrics.numericalCorrectnessRate).toBe(1.0);
    expect(report.metrics.evidenceCoverageRate).toBe(1.0);
    expect(report.metrics.metricResolutionAccuracy).toBe(1.0);
    expect(report.metrics.unsupportedClaimRate).toBe(0.0);
    expect(report.metrics.toolFailureRate).toBe(0.0);
    expect(report.metrics.taskCompletionRate).toBe(1.0);

    // Verify all 12 required test fixtures are executed
    const fixtureIds = report.results.map((r) => r.caseId);
    expect(fixtureIds).toContain('eval_sql_numeric_accuracy');
    expect(fixtureIds).toContain('eval_metric_resolution_ambiguity');
    expect(fixtureIds).toContain('eval_unsupported_metric_schema');
    expect(fixtureIds).toContain('eval_python_assumptions_warnings');
    expect(fixtureIds).toContain('eval_evidence_traceability');
    expect(fixtureIds).toContain('eval_correlation_causation_restraint');
    expect(fixtureIds).toContain('eval_small_sample_communication');
    expect(fixtureIds).toContain('eval_security_prompt_injection');
    expect(fixtureIds).toContain('eval_security_unsafe_sql');
    expect(fixtureIds).toContain('eval_missing_values_and_empty_data');
    expect(fixtureIds).toContain('eval_artifact_generation');
    expect(fixtureIds).toContain('eval_failure_handling_and_recovery');

    // Verify schema adherence
    const parsed = EvaluationReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);

    // Verify report artifact was saved to disk
    const reportPath = path.resolve(process.cwd(), 'reports', 'eval-summary.json');
    expect(fs.existsSync(reportPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(content.summary.totalCases).toBe(12);
    expect(content.metrics.numericalCorrectnessRate).toBe(1.0);
  }, 30000);
});
