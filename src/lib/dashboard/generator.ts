import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import { executeAnalyticalQuery } from '../analytics/duckdb-engine.js';
import {
  type DashboardSpec,
  type GenerateDashboardSpecInput,
  GenerateDashboardSpecInputSchema,
  DASHBOARD_SCHEMA_VERSION,
  MAX_CHARTS_PER_DASHBOARD,
  MAX_DATA_POINTS_PER_CHART,
  MAX_TABLE_ROWS,
} from './types.js';
import {
  formatNumber,
  buildEmptyDashboardSpec,
  buildDashboardKpis,
  buildDashboardCharts,
  buildCorrelationMatrix,
  buildTableSpec,
  buildDashboardFilters,
  mapInsightsToCards,
} from './builders.js';

export { formatNumber };

/**
 * Generates a declarative, versioned DashboardSpec grounded in DuckDB calculations.
 */
export async function generateDashboardSpec(
  input: GenerateDashboardSpecInput,
  options: { customBaseDir?: string } = {}
): Promise<DashboardSpec> {
  const parsedInput = GenerateDashboardSpecInputSchema.parse(input);
  const rowLimit = parsedInput.rowLimit || 100;

  // 1. Run Automated EDA Engine
  const eda = await runAutomatedEda(
    {
      datasetPath: parsedInput.datasetPath,
      includeCorrelations: true,
    },
    { customBaseDir: options.customBaseDir }
  );

  // 2. Generate Evidence-Backed Insights
  const businessInsights = generateBusinessInsights(eda);

  // 3. Query sample rows for data table
  const tableQueryResult = await executeAnalyticalQuery(
    {
      datasetPath: parsedInput.datasetPath,
      sql: 'SELECT * FROM dataset',
      rowLimit,
    },
    { customBaseDir: options.customBaseDir }
  );

  const datasetName = eda.datasetName;
  const dashboardId = `dash_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const title = parsedInput.title || `Analytical Executive Dashboard: ${datasetName}`;
  const description =
    parsedInput.description ||
    `Real-time business analytics grounded in DuckDB calculations over ${eda.rowCount} complete records.`;

  // Empty dataset handling
  if (eda.rowCount === 0) {
    return buildEmptyDashboardSpec(dashboardId, title, description, datasetName, eda.columnCount);
  }

  // 4. Build Executive KPI Headline Cards
  const kpis = buildDashboardKpis(eda);

  // 5. Build Adaptive Charts
  const charts = await buildDashboardCharts(eda, parsedInput.datasetPath, options.customBaseDir);

  // 6. Build Correlation Matrix Specification
  const correlationMatrix = buildCorrelationMatrix(eda);

  // 7. Build Data Table Specification
  const table = buildTableSpec(
    eda,
    tableQueryResult.columns,
    tableQueryResult.rows,
    tableQueryResult.isTruncated
  );

  // 8. Build Interactive Filter Specifications
  const filters = buildDashboardFilters(eda);

  // 9. Map Insights to InsightCardSpec
  const insights = mapInsightsToCards(businessInsights);

  return {
    version: DASHBOARD_SCHEMA_VERSION,
    metadata: {
      id: dashboardId,
      title,
      description,
      datasetName,
      datasetRowCount: eda.rowCount,
      datasetColumnCount: eda.columnCount,
      completenessScore: eda.completenessScore,
      isAggregateComplete: true,
      isDisplayTruncated: tableQueryResult.isTruncated,
      generatedAt: new Date().toISOString(),
      engine: 'DuckDB in-memory analytical statistical engine v1.4.4',
    },
    kpis,
    charts,
    correlationMatrix,
    table,
    filters,
    insights,
    guardrails: {
      maxChartCount: MAX_CHARTS_PER_DASHBOARD,
      maxDataPointsPerChart: MAX_DATA_POINTS_PER_CHART,
      maxTableRows: MAX_TABLE_ROWS,
    },
  };
}
