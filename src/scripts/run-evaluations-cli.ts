#!/usr/bin/env node
/**
 * CLI Runner for Milestone 10 Analytical Quality & Business Correctness Evaluation Suite.
 *
 * Executes 12 deterministic benchmark tests, calculates precision/coverage metrics,
 * and saves a machine-readable JSON summary in reports/eval-summary.json.
 */

import path from 'node:path';
import { runEvaluationSuite } from '../lib/eval/runner.js';

async function main() {
  console.log('='.repeat(80));
  console.log('Milestone 10: Analytical Quality & Business Correctness Evaluation Suite');
  console.log('='.repeat(80));

  console.log('\nRunning 12 deterministic benchmark evaluation cases...\n');
  const report = await runEvaluationSuite();

  // Print results table
  const tableData = report.results.map((r, i) => ({
    '#': i + 1,
    'Benchmark Case': r.name,
    Category: r.category,
    Status: r.status.toUpperCase(),
    'Score (%)': `${Math.round(r.score * 100)}%`,
    'Duration (ms)': `${r.durationMs}ms`,
  }));

  console.table(tableData);

  console.log('-'.repeat(80));
  console.log('EVALUATION BENCHMARK SUMMARY:');
  console.log(`- Total Cases Tested:     ${report.summary.totalCases} (${report.coveredCategories?.length ?? 12} categories covered)`);
  console.log(`- Cases Passed:           ${report.summary.passedCases}`);
  console.log(`- Cases Failed:           ${report.summary.failedCases}`);
  console.log(`- Overall Pass Rate:      ${(report.summary.overallPassRate * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.taskCompletionRate ?? '12/12 fixtures'}]`);
  console.log(`- Numerical Correctness:  ${(report.metrics.numericalCorrectnessRate * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.numericalCorrectnessRate ?? '1/1 fixture'}]`);
  console.log(`- Metric Resolution:      ${(report.metrics.metricResolutionAccuracy * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.metricResolutionAccuracy ?? '1/1 fixture'}]`);
  console.log(`- Evidence Coverage:      ${(report.metrics.evidenceCoverageRate * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.evidenceCoverageRate ?? '1/1 fixture'}]`);
  console.log(`- Unsupported Claim Rate: ${(report.metrics.unsupportedClaimRate * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.unsupportedClaimRate ?? '1/1 fixture'}]`);
  console.log(`- Tool Failure Rate:      ${(report.metrics.toolFailureRate * 100).toFixed(1)}% [Denominator: ${report.metrics.denominators?.toolFailureRate ?? '0/12 fixtures'}]`);
  console.log(`- Total Duration:         ${report.executionDurationMs}ms`);
  console.log('-'.repeat(80));
  console.log('NOTICE: 12/12 passing cases means all 12 current deterministic benchmark fixtures');
  console.log('passed their regression assertions. It does NOT claim or imply that open-domain or');
  console.log('production analytical accuracy is 100%. Real-world accuracy requires continuous telemetry.');
  console.log('-'.repeat(80));

  const jsonPath = path.resolve(process.cwd(), 'reports', 'eval-summary.json');
  console.log(`\nMachine-readable evaluation artifact saved to:\n  file:///${jsonPath.replace(/\\/g, '/')}\n`);

  if (report.summary.failedCases > 0) {
    console.error('Some evaluation cases failed.');
    process.exit(1);
  } else {
    console.log('All 12 deterministic benchmark evaluation cases passed successfully.');
  }
}

main().catch((err) => {
  console.error('Fatal error running evaluation suite:', err);
  process.exit(1);
});
