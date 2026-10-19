import { createTool } from '@mastra/core/tools';
import {
  AnalyticalQueryInputSchema,
  AnalyticalQueryResultSchema,
  type AnalyticalQueryResult,
} from '../../lib/analytics/types.js';
import { executeAnalyticalQuery } from '../../lib/analytics/duckdb-engine.js';

export const EXECUTE_ANALYTICAL_QUERY_TOOL_ID = 'execute-analytical-query-tool';

/**
 * Mastra Tool to execute safe, read-only analytical SQL queries against authorized datasets using DuckDB.
 */
export const executeAnalyticalQueryTool = createTool({
  id: EXECUTE_ANALYTICAL_QUERY_TOOL_ID,
  description:
    'Executes a read-only analytical SQL query against an authorized dataset (.csv or .parquet) using in-process DuckDB. ' +
    'The dataset is exposed under the table name specified by tableAlias (default: "dataset"). ' +
    'Supports aggregations (COUNT, SUM, AVG, MIN, MAX), date/time grouping, joins, CTEs, filtering, and sorting. ' +
    'Mutations, file system operations, and external access are strictly prohibited and blocked.',
  inputSchema: AnalyticalQueryInputSchema,
  outputSchema: AnalyticalQueryResultSchema,
  execute: async (inputData): Promise<AnalyticalQueryResult> => {
    return await executeAnalyticalQuery(inputData);
  },
});
