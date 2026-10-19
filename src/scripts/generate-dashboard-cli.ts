import fs from 'node:fs';
import path from 'node:path';
import { generateDashboardSpec } from '../lib/dashboard/generator.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const datasetPath = args[0] || 'sample_sales.csv';

  console.log('\n================================================================');
  console.log('   Autonomous Data Analyst — Native Dashboard Spec Generator    ');
  console.log('================================================================');
  console.log(`Target Dataset: ${datasetPath}\n`);

  try {
    const spec = await generateDashboardSpec({
      datasetPath,
      title: 'Executive Sales & Operations Dashboard',
      description: 'Unified analytical view grounded in DuckDB aggregates and automated EDA.',
      rowLimit: 50,
    });

    console.log(`Dashboard ID       : ${spec.metadata.id}`);
    console.log(`Schema Version     : ${spec.version}`);
    console.log(`Dataset Records    : ${spec.metadata.datasetRowCount}`);
    console.log(`KPIs Generated     : ${spec.kpis.length}`);
    console.log(`Charts Configured  : ${spec.charts.length} (${spec.charts.map(c => c.chartType).join(', ')})`);
    console.log(`Correlations       : ${spec.correlationMatrix?.matrix.length ?? 0} pairs`);
    console.log(`Insights Embedded  : ${spec.insights.length}`);
    console.log(`Filters Activated  : ${spec.filters.length} (${spec.filters.map(f => f.column).join(', ')})`);

    // Write JSON artifact
    const datasetsDir = path.resolve(process.cwd(), 'datasets');
    const jsonOutputPath = path.join(datasetsDir, 'sample_sales_dashboard.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(spec, null, 2), 'utf-8');
    console.log(`\n✓ Written JSON Spec to: ${jsonOutputPath}`);

    // Also write TS module for frontend preview
    const frontendDir = path.resolve(process.cwd(), 'src/frontend');
    fs.mkdirSync(frontendDir, { recursive: true });
    const tsOutputPath = path.join(frontendDir, 'sample-spec.ts');
    fs.writeFileSync(
      tsOutputPath,
      `// Auto-generated DashboardSpec for sample_sales.csv\nimport type { DashboardSpec } from '../lib/dashboard/types.js';\n\nexport const SAMPLE_SALES_SPEC: DashboardSpec = ${JSON.stringify(spec, null, 2)};\n`,
      'utf-8'
    );
    console.log(`✓ Written Frontend Sample Spec to: ${tsOutputPath}`);
    console.log('\n=== Dashboard Generation Succeeded ===\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n[ERROR] Dashboard generation failed: ${msg}\n`);
    process.exit(1);
  }
}

main();
