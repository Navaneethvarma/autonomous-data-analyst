#!/usr/bin/env node
/**
 * CLI Demonstration for Milestone 10: Workflows, Evaluations, and Observability.
 *
 * Demonstrates:
 * 1. End-to-end typed analytical workflow:
 *    Dataset Inspection -> Metric Resolution -> Planning -> Execution -> Validation -> Insights -> Dashboard/Report.
 * 2. Correlated observability traces with privacy redaction and duration metrics.
 * 3. Ambiguity handling halting cleanly with actionable clarification requests.
 * 4. Sandboxed Python analytical execution with statistical assumptions and warnings.
 * 5. Partial failure containment (validated analysis preserved if artifact generation fails).
 */

import path from 'node:path';
import { AnalyticalWorkflowOrchestrator } from '../lib/workflow/orchestrator.js';

async function main() {
  console.log('='.repeat(80));
  console.log('Milestone 10: Autonomous Data Analyst End-to-End Workflow & Observability Demo');
  console.log('='.repeat(80));

  const orchestrator = new AnalyticalWorkflowOrchestrator();
  const datasetPath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  // =========================================================================
  // DEMO 1: Complete End-to-End Analytical Workflow with DuckDB & Artifacts
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('DEMO 1: Complete End-to-End Workflow (DuckDB + Artifacts)');
  console.log('Question: "What is our gross revenue across product categories?"');
  console.log('-'.repeat(80));

  const result1 = await orchestrator.executeWorkflow({
    userQuery: 'What is our gross revenue across product categories?',
    datasetPath,
    executionEngine: 'duckdb',
    generateArtifacts: {
      dashboard: true,
      report: true,
      reportTitle: 'Category Gross Revenue Performance',
    },
  });

  console.log(`\n[Workflow Result] Status: ${result1.status.toUpperCase()}`);
  console.log(`Trace ID: ${result1.trace.traceId} | Run ID: ${result1.trace.runId}`);
  console.log(`Duration: ${result1.trace.totalDurationMs}ms`);
  console.log(`Dataset Fingerprint: ${result1.trace.schemaFingerprint}`);

  console.log('\n[Stages & Execution Provenance]');
  for (const span of result1.trace.spans) {
    console.log(`  * Stage: ${span.stageName.padEnd(22)} | Tool: ${(span.toolName ?? 'none').padEnd(25)} | Status: ${span.status.padEnd(10)} | ${span.durationMs ?? 0}ms`);
  }

  if (result1.semanticResolution && result1.semanticResolution.resolvedMetric) {
    const def = result1.semanticResolution.resolvedMetric;
    console.log('\n[Semantic Layer Resolution]');
    console.log(`  Metric ID:   ${def.metricId}`);
    console.log(`  Definition:  ${def.name}`);
    console.log(`  Formula:     ${def.calculationFormula}`);
    console.log(`  SQL:         ${def.sqlTemplate}`);
    console.log(`  Owner:       ${def.owner}`);
    console.log(`  Citations:   ${result1.retrievedCitations.length} retrieved passages`);
  }

  if (result1.executionResult) {
    console.log('\n[Analytical Execution]');
    console.log(`  Engine:      ${result1.executionResult.engineUsed}`);
    console.log(`  Row Count:   ${result1.executionResult.rowCount ?? 0}`);
    console.log(`  Execution:   ${result1.executionResult.executionDurationMs}ms`);
    if (result1.executionResult.rows && result1.executionResult.rows.length > 0) {
      console.log('  Data Preview:');
      console.table(result1.executionResult.rows.slice(0, 3));
    }
  }

  if (result1.validationResult) {
    console.log('\n[Evidence Validation]');
    console.log(`  Valid:       ${result1.validationResult.isValid}`);
    console.log(`  Status:      ${result1.validationResult.status}`);
    console.log(`  Rule:        ${result1.validationResult.ruleApplied}`);
    console.log(`  Details:     ${result1.validationResult.details}`);
  }

  if (result1.insights.length > 0) {
    console.log(`\n[Business Insights Generated: ${result1.insights.length}]`);
    for (const insight of result1.insights.slice(0, 2)) {
      console.log(`  * [${insight.type.toUpperCase()}] ${insight.title} (${insight.confidence} confidence)`);
      console.log(`    ${insight.description}`);
    }
  }

  console.log('\n[Generated Artifacts]');
  console.log(`  Dashboard Spec:  ${result1.generatedArtifacts.dashboardSpecGenerated ? 'SUCCESS' : 'SKIPPED'}`);
  console.log(`  Report HTML:     ${result1.generatedArtifacts.reportHtmlPath ? 'SUCCESS (' + result1.generatedArtifacts.reportHtmlPath + ')' : 'SKIPPED'}`);
  console.log(`  Report PDF:      ${result1.generatedArtifacts.reportPdfPath ? 'SUCCESS (' + result1.generatedArtifacts.reportPdfPath + ')' : 'SKIPPED'}`);

  // =========================================================================
  // DEMO 2: Ambiguity Detection & Clarification Halting
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('DEMO 2: Ambiguity Detection & Responsible Halting');
  console.log('Question: "What is our revenue?"');
  console.log('-'.repeat(80));

  const result2 = await orchestrator.executeWorkflow({
    userQuery: 'What is our revenue?',
    datasetPath,
  });

  console.log(`\n[Workflow Result] Status: ${result2.status.toUpperCase()}`);
  console.log(`Clarification Required: ${result2.clarificationQuestion}`);
  if (result2.semanticResolution && result2.semanticResolution.status === 'ambiguous') {
    const candidates = result2.semanticResolution.conflictingDefinitions.join(', ');
    console.log(`Candidate Metrics: ${candidates}`);
  }
  console.log(`Execution Halted: Did execution rerun or hallucinate? -> ${result2.executionResult === null ? 'NO (Clean Halt)' : 'YES (Error)'}`);

  // =========================================================================
  // DEMO 3: Observability and Sensitive Data Redaction
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('DEMO 3: Observability Security & Redaction Check');
  console.log('-'.repeat(80));

  const sensitiveQuery = 'Find API key sk-ant-api03-secret123456789 and user email alice@example.com';
  const result3 = await orchestrator.executeWorkflow({
    userQuery: sensitiveQuery,
    datasetPath,
  });

  const loggedUserQuery = result3.trace.userQuery;
  console.log(`Original Query: "${sensitiveQuery}"`);
  console.log(`Redacted Query in Observability Trace: "${loggedUserQuery}"`);
  const containsRawSecret = loggedUserQuery.includes('sk-ant-api03-secret123456789');
  console.log(`Sensitive API Key Redacted: ${!containsRawSecret ? 'YES (Protected)' : 'NO (Leak Detected)'}`);

  console.log('\n' + '='.repeat(80));
  console.log('Milestone 10 Workflow Demonstration Completed Successfully.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
