import { executeAnalyticalQueryTool } from '../mastra/tools/execute-analytical-query-tool.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sql = args[0] || 'SELECT product_category, COUNT(*) as txns, SUM(quantity) as total_qty, ROUND(AVG(unit_price), 2) as avg_price FROM dataset GROUP BY product_category ORDER BY total_qty DESC';
  const datasetPath = args[1] || 'sample_sales.csv';

  console.log('\n=== Autonomous Data Analyst - DuckDB Analytical Execution ===');
  console.log(`Dataset: ${datasetPath}`);
  console.log(`SQL Query: ${sql}\n`);

  try {
    const rawResult = await executeAnalyticalQueryTool.execute!(
      {
        datasetPath,
        sql,
      },
      {} as any
    );

    if (!rawResult || typeof rawResult !== 'object' || !('rows' in rawResult)) {
      console.log('No valid analytical query result returned.');
      return;
    }

    const result = rawResult;
    console.log(`Execution Time: ${result.executionTimeMs} ms`);
    console.log(`Rows Returned: ${result.rowCount}${result.isTruncated ? ' (TRUNCATED TO ROW LIMIT)' : ''}`);
    console.log(`Engine: ${result.provenance.engine}\n`);

    console.log('--- Query Results ---');
    console.table(result.rows);
    console.log('\n=== Execution Succeeded ===\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[ERROR] Query execution failed: ${message}\n`);
    process.exit(1);
  }
}

main();
