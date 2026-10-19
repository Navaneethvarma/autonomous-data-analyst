#!/usr/bin/env node
/**
 * CLI Demonstration for Milestone 9: Business Context, Semantic Layer & Grounded Domain RAG.
 *
 * Demonstrates:
 * 1. Grounded resolution of natural-language question against approved ASC 606 metric definitions.
 * 2. Retrieval of authoritative corporate accounting citations with prompt injection defenses.
 * 3. Execution of the validated SQL expression in DuckDB without hallucinating columns.
 * 4. Validation of analytical evidence and synthesis of domain-grounded business explanation.
 * 5. Detection of ambiguous business concepts ("revenue") with concise clarifying question.
 * 6. Explicit handling and labeling of unapproved exploratory concepts.
 */

import path from 'node:path';
import { defaultContextRetriever } from '../lib/semantic/retrieval.js';
import { defaultMetricResolver } from '../lib/semantic/resolver.js';
import { profileDataset } from '../lib/dataset/profiler.js';
import { executeAnalyticalQuery } from '../lib/analytics/duckdb-engine.js';
import { validateAnalysisResult } from '../lib/dataset/validation.js';

async function main() {
  console.log('='.repeat(80));
  console.log('Milestone 9: Business Semantic Layer & Grounded Domain RAG Demo');
  console.log('='.repeat(80));

  const datasetPath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');
  console.log(`\nDataset Target: ${datasetPath}`);

  // 1. Profile dataset for schema
  const profile = await profileDataset(datasetPath);
  const datasetColumns = profile.columns.map((c) => ({
    name: c.name,
    inferredType: c.inferredType,
  }));
  console.log(`Discovered Columns: ${datasetColumns.map((c) => `${c.name} (${c.inferredType})`).join(', ')}`);

  // =========================================================================
  // DEMO 1: Grounded Business Question Resolution & DuckDB Computation
  // =========================================================================
  const businessQuestion = 'What is our gross revenue across product categories?';
  console.log('\n' + '-'.repeat(80));
  console.log(`DEMO 1: Grounded Business Question`);
  console.log(`Question: "${businessQuestion}"`);
  console.log('-'.repeat(80));

  // Step A: Retrieve Context
  console.log('\n[Stage 1] Retrieving Authoritative Business Context Documents...');
  const context = defaultContextRetriever.retrieveContext({
    query: businessQuestion,
    maxPassages: 2,
  });
  console.log(`Retrieved ${context.citations.length} authoritative citations:`);
  for (const citation of context.citations) {
    console.log(`  * [${citation.documentId}] ${citation.title} (${citation.section}) - Version ${citation.version}`);
    console.log(`    Excerpt: "${citation.snippet}"`);
  }

  // Step B: Resolve Metric
  console.log('\n[Stage 2] Resolving Business Metric against Corporate Semantic Layer...');
  const resolution = defaultMetricResolver.resolveMetric({
    userQuery: businessQuestion,
    datasetColumns,
  });

  console.log(`Resolution Status: ${resolution.status.toUpperCase()}`);
  console.log(`Resolved Metric: ${resolution.resolvedMetric?.name} (ID: ${resolution.resolvedMetric?.metricId})`);
  console.log(`Owner: ${resolution.resolvedMetric?.owner}`);
  console.log(`Additivity: ${resolution.resolvedMetric?.additivity} (${resolution.resolvedMetric?.aggregationType})`);
  console.log(`Approved Formula: ${resolution.resolvedMetric?.calculationFormula}`);
  console.log(`Grounded SQL Template: ${resolution.sqlExpression}`);
  console.log(`Required Columns Mapped: ${JSON.stringify(resolution.columnMapping)}`);
  console.log(`Confidence Score: ${resolution.provenance.confidenceScore * 100}%`);

  // Step C: Execute DuckDB Query using Grounded Formula
  console.log('\n[Stage 3] Executing Analytical DuckDB Query with Grounded Formula...');
  const sql = `
    SELECT 
      product_category, 
      ${resolution.sqlExpression} AS gross_revenue,
      COUNT(*) AS transaction_count
    FROM dataset
    GROUP BY product_category
    ORDER BY gross_revenue DESC
  `;
  console.log(`Generated SQL:\n${sql.trim()}`);

  const queryResult = await executeAnalyticalQuery({
    datasetPath,
    sql,
  });
  console.log('\nExecution Output:');
  console.table(queryResult.rows);
  const topCategory = queryResult.rows[0];

  // Step D: Validate Evidence
  console.log('\n[Stage 4] Validating Statistical and Business Evidence...');
  const validation = validateAnalysisResult({
    metricName: resolution.resolvedMetric?.name ?? 'Gross Revenue',
    metricValue: Number(topCategory?.gross_revenue),
    rule: {
      type: 'non_negative',
    },
  });
  console.log(`Evidence Validated: ${validation.isValid}`);
  console.log(`Row Count: ${queryResult.rowCount}`);

  // Step E: Domain-Grounded Business Explanation
  console.log('\n[Stage 5] Domain-Grounded Explanation (Grounded in ASC 606):');
  console.log(
    `Based on approved metric definition '${resolution.resolvedMetric?.name}' (v${resolution.resolvedMetric?.version}, ` +
    `governed by ${resolution.resolvedMetric?.owner}) and standard revenue recognition principles (ASC 606):\n` +
    `- Total Gross Revenue is computed as SUM(unit_price * quantity).\n` +
    `- Leading category is '${topCategory?.product_category}' generating $${Number(topCategory?.gross_revenue).toLocaleString('en-US', { minimumFractionDigits: 2 })} across ${topCategory?.transaction_count} transactions.\n` +
    `- Additivity verification: As an additive metric, these category figures can be safely summed across groups to compute the company-wide total.\n` +
    `- Traceability: Cited policy '${context.citations[0]?.title}' (${context.citations[0]?.section}).`
  );

  // =========================================================================
  // DEMO 2: Ambiguity Detection & Concise Clarifying Question
  // =========================================================================
  const ambiguousQuestion = 'What is our total revenue?';
  console.log('\n' + '-'.repeat(80));
  console.log(`DEMO 2: Ambiguity Detection (Gross Revenue vs Net Revenue)`);
  console.log(`Question: "${ambiguousQuestion}"`);
  console.log('-'.repeat(80));

  const ambigResolution = defaultMetricResolver.resolveMetric({
    userQuery: ambiguousQuestion,
    datasetColumns,
  });

  console.log(`Resolution Status: ${ambigResolution.status.toUpperCase()}`);
  console.log(`Conflicting Definitions: [${ambigResolution.conflictingDefinitions.join(', ')}]`);
  console.log(`Generated Clarifying Question:`);
  console.log(`  "${ambigResolution.clarificationNeeded}"`);
  console.log(`Warning: ${ambigResolution.warnings[0]}`);

  // =========================================================================
  // DEMO 3: Unapproved Business Concept Handled as Exploratory
  // =========================================================================
  const exploratoryQuestion = 'Calculate the viral loop coefficient for active users';
  console.log('\n' + '-'.repeat(80));
  console.log(`DEMO 3: Unapproved Concept Handling`);
  console.log(`Question: "${exploratoryQuestion}"`);
  console.log('-'.repeat(80));

  const expResolution = defaultMetricResolver.resolveMetric({
    userQuery: exploratoryQuestion,
    datasetColumns,
  });

  console.log(`Resolution Status: ${expResolution.status.toUpperCase()}`);
  console.log(`Resolved Metric: ${expResolution.resolvedMetric ?? 'None (Unregistered)'}`);
  console.log(`Warnings Issued:`);
  for (const w of expResolution.warnings) {
    console.log(`  ! ${w}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Milestone 9 Demonstration Complete.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal CLI Error in Milestone 9 Demo:', err);
  process.exit(1);
});
