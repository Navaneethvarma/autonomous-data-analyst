import type { DatasetEdaSummary, BusinessInsight } from '../analytics/eda-types.js';
import {
  type DashboardSpec,
  type KpiCardSpec,
  type CorrelationMatrixSpec,
  type TableSpec,
  type FilterSpec,
  type InsightCardSpec,
  DASHBOARD_SCHEMA_VERSION,
  MAX_CHARTS_PER_DASHBOARD,
  MAX_KPIS_PER_DASHBOARD,
  MAX_DATA_POINTS_PER_CHART,
  MAX_TABLE_ROWS,
} from './types.js';

export {
  buildCategoricalCharts,
  buildTimeSeriesCharts,
  buildHistogramCharts,
  buildScatterCharts,
  buildDashboardCharts,
} from './chart-builders.js';

/**
 * Formats numeric values nicely for executive KPI cards (e.g. $4,200.50, 98.5%).
 */
export function formatNumber(num: number): string {
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(2)}k`;
  }
  if (Number.isInteger(num)) {
    return num.toLocaleString();
  }
  return num.toFixed(2);
}

/**
 * Generates an empty DashboardSpec fallback when rowCount is 0.
 */
export function buildEmptyDashboardSpec(
  dashboardId: string,
  title: string,
  description: string,
  datasetName: string,
  columnCount: number
): DashboardSpec {
  return {
    version: DASHBOARD_SCHEMA_VERSION,
    metadata: {
      id: dashboardId,
      title,
      description,
      datasetName,
      datasetRowCount: 0,
      datasetColumnCount: columnCount,
      completenessScore: 0,
      isAggregateComplete: true,
      isDisplayTruncated: false,
      generatedAt: new Date().toISOString(),
      engine: 'DuckDB in-memory analytical statistical engine v1.4.4',
    },
    kpis: [
      {
        id: 'kpi_total_records',
        label: 'Total Records',
        value: 0,
        formattedValue: '0',
        unit: 'rows',
        definition: 'Total records in authorized dataset',
        evidenceRef: 'COUNT(*) = 0',
        status: 'negative',
        trendDirection: 'neutral',
      },
    ],
    charts: [],
    table: {
      id: 'table_empty',
      title: 'Dataset Table (Empty)',
      columns: [],
      rows: [],
      totalRowCount: 0,
      displayRowCount: 0,
      isTruncated: false,
      pageSize: 10,
      defaultSortDirection: 'asc',
    },
    filters: [],
    insights: [
      {
        id: 'ins_empty_dataset',
        title: 'Empty Dataset Notice',
        category: 'data_quality_risk',
        importance: 'critical',
        observedFact: `Dataset '${datasetName}' contains 0 rows.`,
        hypothesis: 'File contains only column headers or data ingestion is pending.',
        recommendation: 'Verify the data pipeline populates records prior to dashboard generation.',
        analyticalMethod: 'table_row_count',
        confidence: 'high',
        affectedColumns: [],
      },
    ],
    guardrails: {
      maxChartCount: MAX_CHARTS_PER_DASHBOARD,
      maxDataPointsPerChart: MAX_DATA_POINTS_PER_CHART,
      maxTableRows: MAX_TABLE_ROWS,
    },
  };
}

/**
 * Constructs executive KPI cards from automated EDA metrics.
 */
export function buildDashboardKpis(eda: DatasetEdaSummary): KpiCardSpec[] {
  const kpis: KpiCardSpec[] = [];

  // KPI 1: Total Records
  kpis.push({
    id: 'kpi_total_records',
    label: 'Total Records',
    value: eda.rowCount,
    formattedValue: eda.rowCount.toLocaleString(),
    unit: 'records',
    definition: 'Total authorized records verified in complete dataset',
    evidenceRef: `DuckDB: SELECT COUNT(*) FROM dataset -> ${eda.rowCount}`,
    status: 'neutral',
    trendDirection: 'neutral',
  });

  // KPI 2: Completeness Score
  kpis.push({
    id: 'kpi_data_completeness',
    label: 'Data Completeness',
    value: eda.completenessScore,
    formattedValue: `${eda.completenessScore}%`,
    unit: '%',
    definition: 'Non-null cells divided by total table capacity matrix',
    evidenceRef: `Missingness audit across ${eda.columnCount} columns`,
    status: eda.completenessScore >= 95 ? 'positive' : eda.completenessScore >= 80 ? 'neutral' : 'warning',
    trendDirection: 'neutral',
  });

  // KPI 3 & 4 from numeric columns
  for (const num of eda.numericDistributions) {
    if (kpis.length >= MAX_KPIS_PER_DASHBOARD) break;
    if (num.isConstant || num.count === 0) continue;

    const label = num.column
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());

    let change: number | undefined;
    let changePeriod: string | undefined;
    let trendDirection: KpiCardSpec['trendDirection'] = 'neutral';

    if (eda.temporalAnalyses.length > 0) {
      const temp = eda.temporalAnalyses[0]!;
      if (temp.growthRatePercentage !== null) {
        change = temp.growthRatePercentage;
        changePeriod = `over ${temp.rangeDays}d span`;
        trendDirection = temp.trendDirection === 'increasing' ? 'up' : temp.trendDirection === 'decreasing' ? 'down' : 'flat';
      }
    }

    if (num.mean !== null && num.median !== null) {
      kpis.push({
        id: `kpi_${num.column}_median`,
        label: `Median ${label}`,
        value: num.median,
        formattedValue: formatNumber(num.median),
        unit: num.column.toLowerCase().includes('price') || num.column.toLowerCase().includes('revenue') ? '$' : undefined,
        change,
        changePeriod,
        trendDirection,
        definition: `Robust central tendency (p50) across ${num.count} non-null values (Mean: ${formatNumber(num.mean)})`,
        evidenceRef: `DuckDB: MEDIAN(${num.column}) -> ${num.median}`,
        status: 'neutral',
      });
    }
  }

  return kpis;
}

/**
 * Builds correlation matrix specification if pairwise correlations exist.
 */
export function buildCorrelationMatrix(eda: DatasetEdaSummary): CorrelationMatrixSpec | undefined {
  if (eda.correlations.length === 0) return undefined;

  const colSet = new Set<string>();
  eda.correlations.forEach((c: { columnA: string; columnB: string }) => {
    colSet.add(c.columnA);
    colSet.add(c.columnB);
  });

  return {
    id: 'matrix_correlations',
    title: 'Pairwise Pearson Correlation Matrix',
    columns: Array.from(colSet),
    matrix: eda.correlations.map((c: { columnA: string; columnB: string; pearsonCoefficient: number; strength: any; sampleSize: number }) => ({
      columnA: c.columnA,
      columnB: c.columnB,
      coefficient: c.pearsonCoefficient,
      strength: c.strength,
      sampleSize: c.sampleSize,
    })),
    causationWarning:
      'CRITICAL METHODOLOGICAL NOTICE: Statistical correlation measures linear co-occurrence and does NOT demonstrate, establish, or imply causal influence. Controlled experimentation is required before making operational decisions.',
    evidenceRef: 'DuckDB: CORR() computed pairwise over valid non-null records',
  };
}

/**
 * Builds the data table specification from EDA and query result.
 */
export function buildTableSpec(
  eda: DatasetEdaSummary,
  columns: string[],
  rows: any[],
  isTruncated: boolean
): TableSpec {
  const tableColumns = columns.map(col => {
    const numMatch = eda.numericDistributions.find((n: { column: string }) => n.column === col);
    const dateMatch = eda.temporalAnalyses.find((t: { dateColumn: string }) => t.dateColumn === col);
    const colType: 'string' | 'number' | 'date' | 'boolean' = numMatch
      ? 'number'
      : dateMatch
      ? 'date'
      : 'string';

    return {
      key: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      type: colType,
    };
  });

  return {
    id: 'table_main_dataset',
    title: `Dataset Records (${rows.length} rows previewed of ${eda.rowCount} total)`,
    columns: tableColumns,
    rows: rows as Array<Record<string, string | number | boolean | null>>,
    totalRowCount: eda.rowCount,
    displayRowCount: rows.length,
    isTruncated,
    pageSize: 10,
    defaultSortColumn: tableColumns[0]?.key,
    defaultSortDirection: 'asc',
  };
}

/**
 * Builds interactive filter specifications from low-cardinality categorical distributions.
 */
export function buildDashboardFilters(eda: DatasetEdaSummary): FilterSpec[] {
  const filters: FilterSpec[] = [];
  for (const cat of eda.categoricalDistributions) {
    if (filters.length >= 4) break;
    if (cat.isConstant || cat.distinctCount > 25 || cat.distinctCount < 2) continue;

    filters.push({
      id: `filter_${cat.column}`,
      column: cat.column,
      label: cat.column.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      type: cat.column.toLowerCase().includes('status') ? 'status_select' : 'category_select',
      options: ['All', ...cat.topValues.map((v: { value: string }) => v.value)],
      defaultValue: 'All',
    });
  }
  return filters;
}

/**
 * Maps business insights to dashboard InsightCardSpec items.
 */
export function mapInsightsToCards(businessInsights: BusinessInsight[]): InsightCardSpec[] {
  return businessInsights.map(ins => ({
    id: ins.id,
    title: ins.title,
    category: ins.category,
    importance: ins.importance,
    observedFact: ins.observedFact,
    hypothesis: ins.hypothesis,
    recommendation: ins.recommendation,
    analyticalMethod: ins.analyticalMethod,
    confidence: ins.confidence,
    affectedColumns: ins.affectedColumns,
    caveat: ins.limitations[0],
  }));
}
