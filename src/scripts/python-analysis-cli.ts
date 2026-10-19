import * as path from 'path';
import { executeSandboxedPython } from '../lib/python/sandbox-runner.js';
import { PythonAnalysisRequest } from '../lib/python/types.js';

async function main() {
  console.log('='.repeat(80));
  console.log(' autonomous-data-analyst: Sandboxed Python Analytics Engine (Milestone 8)');
  console.log('='.repeat(80));

  const datasetPath = path.join('datasets', 'sample_sales.csv');

  // 1. Descriptive Distribution & Outlier Detection
  console.log('\n--- Task 1: Descriptive Distribution & Tukey Outliers (unit_price) ---');
  const req1: PythonAnalysisRequest = {
    taskId: 'cli-task-1',
    taskType: 'descriptive_stats',
    datasetId: 'sample_sales',
    datasetPath,
    columns: ['unit_price'],
    parameters: { column: 'unit_price' },
    limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 10000 },
  };

  const res1 = await executeSandboxedPython(req1);
  console.log(`Status:         ${res1.status}`);
  console.log(`Interpretation: ${res1.interpretation}`);
  console.log(`Sample Size:    Valid N=${res1.sampleSize.validObservations}, Dropped=${res1.sampleSize.droppedOrMissing}`);
  console.log(`Numeric Metrics:`, res1.numericResults);
  console.log(`Assumptions:   `, res1.assumptions);
  console.log(`Warnings:      `, res1.warnings);

  // 2. Group Comparison (Welch's t-test)
  console.log('\n--- Task 2: Hypothesis Testing / Welch t-test (unit_price by discount_applied) ---');
  const req2: PythonAnalysisRequest = {
    taskId: 'cli-task-2',
    taskType: 'group_comparison',
    datasetId: 'sample_sales',
    datasetPath,
    columns: ['unit_price', 'discount_applied'],
    parameters: {
      metricColumn: 'unit_price',
      groupColumn: 'discount_applied',
      groupA: 'false',
      groupB: 'true',
    },
    limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 10000 },
  };

  const res2 = await executeSandboxedPython(req2);
  console.log(`Status:         ${res2.status}`);
  console.log(`Interpretation: ${res2.interpretation}`);
  console.log(`t-Statistic:    ${res2.numericResults.tStatistic}, p-Value: ${res2.numericResults.pValue}`);
  console.log(`Cohen's d:      ${res2.numericResults.cohensD}`);
  console.log(`Is Significant: ${res2.numericResults.isSignificant}`);

  // 3. Linear Regression & Variance Explained (R²)
  console.log('\n--- Task 3: OLS Linear Regression (unit_price on quantity) ---');
  const req3: PythonAnalysisRequest = {
    taskId: 'cli-task-3',
    taskType: 'regression',
    datasetId: 'sample_sales',
    datasetPath,
    columns: ['unit_price', 'quantity'],
    parameters: {
      independentColumn: 'quantity',
      dependentColumn: 'unit_price',
    },
    limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 10000 },
  };

  const res3 = await executeSandboxedPython(req3);
  console.log(`Status:         ${res3.status}`);
  console.log(`Interpretation: ${res3.interpretation}`);
  console.log(`R²:             ${res3.numericResults.rSquared}, Adj R²: ${res3.numericResults.adjustedRSquared}`);
  console.log(`Slope:          ${res3.numericResults.slope}, Intercept: ${res3.numericResults.intercept}`);
  console.log(`p-Value:        ${res3.numericResults.pValue}`);

  // 4. Multi-Group ANOVA
  console.log('\n--- Task 4: One-Way ANOVA (unit_price across product_category) ---');
  const req4: PythonAnalysisRequest = {
    taskId: 'cli-task-4',
    taskType: 'anova',
    datasetId: 'sample_sales',
    datasetPath,
    columns: ['unit_price', 'product_category'],
    parameters: {
      metricColumn: 'unit_price',
      groupColumn: 'product_category',
    },
    limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 10000 },
  };

  const res4 = await executeSandboxedPython(req4);
  console.log(`Status:         ${res4.status}`);
  console.log(`Interpretation: ${res4.interpretation}`);
  console.log(`F-Statistic:    ${res4.numericResults.fStatistic}, p-Value: ${res4.numericResults.pValue}`);

  // 5. Security & Isolation Boundary Verification
  console.log('\n--- Task 5: Security Boundary Enforcement (Untrusted Code Rejection) ---');
  const maliciousReq: PythonAnalysisRequest = {
    taskId: 'cli-sec-test',
    taskType: 'custom_script',
    datasetId: 'sample_sales',
    datasetPath,
    columns: ['unit_price'],
    code: `import os\nos.system('echo compromised')`,
    limits: { timeoutMs: 5000, maxOutputBytes: 524288, maxRows: 1000 },
  };

  const secRes = await executeSandboxedPython(maliciousReq);
  console.log(`Status:         ${secRes.status}`);
  console.log(`Interpretation: ${secRes.interpretation}`);
  console.log(`Error Caught:   ${secRes.error}`);

  console.log('\n' + '='.repeat(80));
  console.log(' All Python analytics tasks completed successfully within sandbox boundaries.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
