import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import { executeAnalyticalQuery } from '../analytics/duckdb-engine.js';
import {
  type DashboardSpec,
  type KpiCardSpec,
  type ChartSpec,
  type CorrelationMatrixSpec,
  type TableSpec,
  type FilterSpec,
  type InsightCardSpec,
  type GenerateDashboardSpecInput,
  GenerateDashboardSpecInputSchema,
  DASHBOARD_SCHEMA_VERSION,
  MAX_CHARTS_PER_DASHBOARD,
  MAX_KPIS_PER_DASHBOARD,
  MAX_DATA_POINTS_PER_CHART,
  MAX_TABLE_ROWS,
} from './types.js';

/**
 * Formats numeric values nicely for executive KPI cards (e.g. $4,200.50, 98.5%).
 */
function formatNumber(num: number): string {
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
    return {
      version: DASHBOARD_SCHEMA_VERSION,
      metadata: {
        id: dashboardId,
        title,
        description,
        datasetName,
        datasetRowCount: 0,
        datasetColumnCount: eda.columnCount,
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

  // 4. Build Executive KPI Headline Cards
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

  // KPI 3 & 4 from numeric columns (e.g. quantity, sales, unit_price)
  for (const num of eda.numericDistributions) {
    if (kpis.length >= MAX_KPIS_PER_DASHBOARD) break;
    if (num.isConstant || num.count === 0) continue;

    const label = num.column
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    // Compute change delta if temporal analysis tracked this metric
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

  // 5. Build Adaptive Charts
  const charts: ChartSpec[] = [];

  // Chart Type A: Categorical Distribution (Bar or Donut)
  for (const cat of eda.categoricalDistributions) {
    if (charts.length >= MAX_CHARTS_PER_DASHBOARD) break;
    if (cat.isConstant || cat.isHighCardinality || cat.topValues.length === 0) continue;

    const chartTitle = `${cat.column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Distribution`;
    const isSmallSet = cat.topValues.length <= 5;
    const chartType: ChartSpec['chartType'] = isSmallSet ? 'donut' : 'bar';

    if (chartType === 'donut') {
      charts.push({
        id: `chart_cat_${cat.column}`,
        title: chartTitle,
        description: `Breakdown across ${cat.distinctCount} distinct categories. Dominant segment: '${cat.mode}' (${cat.concentrationPercentage}% of total).`,
        chartType: 'donut',
        series: [
          {
            name: cat.column,
            data: cat.topValues.map(v => ({
              name: v.value,
              value: v.count,
            })),
          },
        ],
        evidenceRef: `SELECT ${cat.column}, COUNT(*) FROM dataset GROUP BY ${cat.column}`,
        affectedColumns: [cat.column],
        width: 'half',
      });
    } else {
      charts.push({
        id: `chart_cat_${cat.column}`,
        title: chartTitle,
        description: `Ranked frequency of top ${cat.topValues.length} categories across ${cat.totalCount} non-null records.`,
        chartType: 'bar',
        categories: cat.topValues.map(v => v.value),
        series: [
          {
            name: 'Record Count',
            data: cat.topValues.map(v => v.count),
            color: '#3b82f6',
          },
        ],
        xAxisLabel: cat.column,
        yAxisLabel: 'Count',
        evidenceRef: `SELECT ${cat.column}, COUNT(*) FROM dataset GROUP BY ${cat.column} ORDER BY COUNT(*) DESC`,
        affectedColumns: [cat.column],
        width: 'half',
      });
    }
  }

  // Chart Type B: Time Series Trend (Line Chart with Anomaly Markers)
  for (const temp of eda.temporalAnalyses) {
    if (charts.length >= MAX_CHARTS_PER_DASHBOARD) break;
    if (temp.dataPoints.length < 2) continue;

    const anomalyMarkers = temp.anomalousPeriods.map(p => {
      const pt = temp.dataPoints.find(dp => dp.period === p);
      const val = pt ? (pt.metricSum ?? pt.count) : 0;
      return {
        periodOrLabel: p,
        value: val,
        note: 'Statistical volatility exceeding ±2σ from mean period run-rate',
      };
    });

    charts.push({
      id: `chart_trend_${temp.dateColumn}`,
      title: `Time-Series Trajectory along '${temp.dateColumn}'`,
      description: `Period trajectory (${temp.periodType}) over ${temp.rangeDays} days (${temp.minDate} to ${temp.maxDate}). Net period change: ${temp.growthRatePercentage ?? 0}%.`,
      chartType: 'line',
      categories: temp.dataPoints.map(p => p.period),
      series: [
        {
          name: temp.dataPoints[0]?.metricSum !== undefined ? 'Aggregated Metric' : 'Activity Volume',
          data: temp.dataPoints.map(p => p.metricSum ?? p.count),
          color: '#10b981',
        },
      ],
      xAxisLabel: `Period (${temp.periodType})`,
      yAxisLabel: 'Value',
      anomalyMarkers,
      evidenceRef: `DuckDB: GROUP BY ${temp.dateColumn} (${temp.periodType} bucketing)`,
      affectedColumns: [temp.dateColumn],
      width: 'full',
    });
  }

  // Chart Type C: Numeric Distribution & Outlier Detection (Histogram)
  for (const num of eda.numericDistributions) {
    if (charts.length >= MAX_CHARTS_PER_DASHBOARD) break;
    if (num.isConstant || num.count < 4 || num.min === null || num.max === null) continue;

    // Build 5-10 histogram buckets using DuckDB
    const bucketCount = Math.min(8, Math.max(4, Math.floor(Math.sqrt(num.count))));
    const minVal = num.min;
    const maxVal = num.max;
    const binWidth = (maxVal - minVal) / bucketCount;

    if (binWidth > 0) {
      const bucketsSql = `
        SELECT 
          FLOOR((${num.column} - ${minVal}) / ${binWidth}) as bucket_idx,
          COUNT(*) as bucket_count
        FROM dataset
        WHERE ${num.column} IS NOT NULL
        GROUP BY bucket_idx
        ORDER BY bucket_idx ASC;
      `;

      let binCategories: string[] = [];
      let binCounts: number[] = [];

      try {
        const binRes = await executeAnalyticalQuery(
          {
            datasetPath: parsedInput.datasetPath,
            sql: bucketsSql,
          },
          { customBaseDir: options.customBaseDir }
        );

        const bucketMap = new Map<number, number>();
        for (const row of binRes.rows) {
          bucketMap.set(Number(row.bucket_idx), Number(row.bucket_count));
        }

        for (let b = 0; b < bucketCount; b++) {
          const lower = Number((minVal + b * binWidth).toFixed(1));
          const upper = Number((minVal + (b + 1) * binWidth).toFixed(1));
          binCategories.push(`${lower}-${upper}`);
          binCounts.push(bucketMap.get(b) || 0);
        }
      } catch {
        // Fallback single summary bar if bucket query failed
        binCategories = [`${minVal} - ${maxVal}`];
        binCounts = [num.count];
      }

      charts.push({
        id: `chart_hist_${num.column}`,
        title: `Distribution & Outlier Analysis: '${num.column}'`,
        description: `Distribution spread across ${bucketCount} intervals. Outlier bounds: [${num.outlierBounds.lowerBound ?? 'N/A'}, ${num.outlierBounds.upperBound ?? 'N/A'}]. Detected: ${num.outlierCount} outliers (${num.outlierPercentage}%).`,
        chartType: 'histogram',
        categories: binCategories,
        series: [
          {
            name: 'Frequency',
            data: binCounts,
            color: '#6366f1',
          },
        ],
        xAxisLabel: `${num.column} (Intervals)`,
        yAxisLabel: 'Frequency',
        outlierBounds: num.outlierBounds,
        evidenceRef: `DuckDB: QUANTILE_CONT(0.25) = ${num.p25}, QUANTILE_CONT(0.75) = ${num.p75}, IQR = ${num.iqr}`,
        affectedColumns: [num.column],
        width: 'half',
      });
    }
  }

  // Chart Type D: Bivariate Scatter Plot for Correlated Numeric Pairs
  if (eda.correlations.length > 0) {
    const primaryCorr = eda.correlations[0]!;
    if (charts.length < MAX_CHARTS_PER_DASHBOARD) {
      try {
        const scatterSql = `
          SELECT "${primaryCorr.columnA}" as x_val, "${primaryCorr.columnB}" as y_val
          FROM dataset
          WHERE "${primaryCorr.columnA}" IS NOT NULL AND "${primaryCorr.columnB}" IS NOT NULL
          LIMIT 1000;
        `;

        const scatterRes = await executeAnalyticalQuery(
          {
            datasetPath: parsedInput.datasetPath,
            sql: scatterSql,
          },
          { customBaseDir: options.customBaseDir }
        );

        const scatterPoints: Array<[number | string, number | string]> = scatterRes.rows.map(r => [
          Number(r.x_val),
          Number(r.y_val),
        ]);

        charts.push({
          id: `chart_scatter_${primaryCorr.columnA}_${primaryCorr.columnB}`,
          title: `Bivariate Scatter: '${primaryCorr.columnA}' vs '${primaryCorr.columnB}'`,
          description: `Pairwise scatter plot (Pearson r = ${primaryCorr.pearsonCoefficient.toFixed(2)}, n = ${primaryCorr.sampleSize}). Note: correlation indicates co-movement only.`,
          chartType: 'scatter',
          series: [
            {
              name: 'Observations',
              data: scatterPoints,
              color: '#8b5cf6',
            },
          ],
          xAxisLabel: primaryCorr.columnA,
          yAxisLabel: primaryCorr.columnB,
          causationCaveat: primaryCorr.causationCaveat,
          evidenceRef: `DuckDB: CORR(${primaryCorr.columnA}, ${primaryCorr.columnB}) -> ${primaryCorr.pearsonCoefficient}`,
          affectedColumns: [primaryCorr.columnA, primaryCorr.columnB],
          width: 'half',
        });
      } catch {
        // Safe fallback if scatter query encountered type conversion issue
      }
    }
  }

  // 6. Build Correlation Matrix Specification
  let correlationMatrix: CorrelationMatrixSpec | undefined;
  if (eda.correlations.length > 0) {
    const colSet = new Set<string>();
    eda.correlations.forEach(c => {
      colSet.add(c.columnA);
      colSet.add(c.columnB);
    });

    correlationMatrix = {
      id: 'matrix_correlations',
      title: 'Pairwise Pearson Correlation Matrix',
      columns: Array.from(colSet),
      matrix: eda.correlations.map(c => ({
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

  // 7. Build Data Table Specification
  const tableColumns = tableQueryResult.columns.map(col => {
    const numMatch = eda.numericDistributions.find(n => n.column === col);
    const dateMatch = eda.temporalAnalyses.find(t => t.dateColumn === col);
    const colType: 'string' | 'number' | 'date' | 'boolean' = numMatch
      ? 'number'
      : dateMatch
      ? 'date'
      : 'string';

    return {
      key: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: colType,
    };
  });

  const table: TableSpec = {
    id: 'table_main_dataset',
    title: `Dataset Records (${tableQueryResult.rows.length} rows previewed of ${eda.rowCount} total)`,
    columns: tableColumns,
    rows: tableQueryResult.rows as Array<Record<string, string | number | boolean | null>>,
    totalRowCount: eda.rowCount,
    displayRowCount: tableQueryResult.rows.length,
    isTruncated: tableQueryResult.isTruncated,
    pageSize: 10,
    defaultSortColumn: tableColumns[0]?.key,
    defaultSortDirection: 'asc',
  };

  // 8. Build Interactive Filter Specifications
  const filters: FilterSpec[] = [];
  for (const cat of eda.categoricalDistributions) {
    if (filters.length >= 4) break;
    if (cat.isConstant || cat.distinctCount > 25 || cat.distinctCount < 2) continue;

    filters.push({
      id: `filter_${cat.column}`,
      column: cat.column,
      label: cat.column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: cat.column.toLowerCase().includes('status') ? 'status_select' : 'category_select',
      options: ['All', ...cat.topValues.map(v => v.value)],
      defaultValue: 'All',
    });
  }

  // 9. Map Insights to InsightCardSpec
  const insights: InsightCardSpec[] = businessInsights.map(ins => ({
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
