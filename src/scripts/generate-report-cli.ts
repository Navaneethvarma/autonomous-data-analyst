import path from 'node:path';
import fs from 'node:fs';
import { generateReportTool } from '../mastra/tools/generate-report-tool.js';

async function main() {
  const args = process.argv.slice(2);
  const datasetArg = args.find(a => !a.startsWith('--')) || 'datasets/sample_sales.csv';
  const outDirArg = args.find(a => a.startsWith('--output-dir='))?.split('=')[1] || 'reports';
  const formatArg = (args.find(a => a.startsWith('--format='))?.split('=')[1] || 'both') as 'html' | 'pdf' | 'both';

  const datasetPath = path.resolve(process.cwd(), datasetArg);

  if (!fs.existsSync(datasetPath)) {
    console.error(`Error: Dataset file not found at ${datasetPath}`);
    process.exit(1);
  }

  console.log(`================================================================================`);
  console.log(` Autonomous Data Analyst — Executive Business Report Generator (Milestone 7)`);
  console.log(`================================================================================`);
  console.log(`Target Dataset:     ${datasetPath}`);
  console.log(`Output Directory:   ${path.resolve(process.cwd(), outDirArg)}`);
  console.log(`Requested Formats:  ${formatArg.toUpperCase()}`);
  console.log(`\nExecuting analytical engine, automated EDA, and executive report synthesis...`);

  const startTime = Date.now();

  const result = await generateReportTool.execute!(
    {
      datasetPath,
      outputDirectory: outDirArg,
      outputFormat: formatArg,
      title: 'Executive Sales & Operations Performance Report',
      subtitle: 'Quarterly business analytics, distribution profiles, and evidence-backed recommendations',
      temporalDateColumn: 'transaction_date',
      temporalMetricColumn: 'unit_price',
    },
    {} as any
  );

  if (!result || !('reportSpec' in result)) {
    console.error('Fatal Report Generation Error: Tool did not return a valid report spec');
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;
  const spec = result.reportSpec;

  console.log(`\n================================================================================`);
  console.log(` Executive Report Generation Succeeded (${durationMs}ms)`);
  console.log(`================================================================================`);
  console.log(`Report Title:       ${spec.metadata.title}`);
  console.log(`Dataset Scope:      ${spec.metadata.datasetRowCount.toLocaleString()} rows, ${spec.metadata.datasetColumnCount} columns`);
  console.log(`Completeness Score: ${spec.metadata.completenessScore.toFixed(1)}% (Trust Rating: ${spec.executiveSummary.dataTrustRating.toUpperCase()})`);
  if (spec.metadata.reportingPeriod) {
    console.log(`Reporting Period:   ${spec.metadata.reportingPeriod.startDate} to ${spec.metadata.reportingPeriod.endDate} (${spec.metadata.reportingPeriod.durationDays} days)`);
  }
  console.log(`Executive KPIs:     ${spec.kpis.length} defined`);
  console.log(`Ranked Findings:    ${spec.findings.length} prioritized`);
  console.log(`Visual Charts:      ${spec.charts.length} vector charts`);
  console.log(`Tabular Summaries:  ${spec.tables.length} tables`);
  console.log(`Statistical Checks: ${spec.statisticalAnalysis.correlations.length} correlations, ${spec.statisticalAnalysis.outliers.length} outlier attributes`);

  console.log(`\nExecutive Summary Headline:`);
  console.log(`  "${spec.executiveSummary.headline}"`);

  console.log(`\nTop Strategic Takeaways:`);
  spec.executiveSummary.primaryTakeaways.forEach((t: string, i: number) => {
    console.log(`  ${i + 1}. ${t}`);
  });

  console.log(`\nGenerated Artifacts:`);
  if (result.htmlPath && fs.existsSync(result.htmlPath)) {
    const htmlStats = fs.statSync(result.htmlPath);
    console.log(`  [HTML] ${result.htmlPath} (${(htmlStats.size / 1024).toFixed(1)} KB)`);
  }
  if (result.pdfPath && fs.existsSync(result.pdfPath)) {
    const pdfStats = fs.statSync(result.pdfPath);
    console.log(`  [PDF]  ${result.pdfPath} (${(pdfStats.size / 1024).toFixed(1)} KB)`);
  }
  if (result.pdfWarning) {
    console.warn(`  [Notice] ${result.pdfWarning}`);
  }

  console.log(`\nReport generation complete.\n`);
}

main().catch(err => {
  console.error('Fatal Report Generation Error:', err);
  process.exit(1);
});
