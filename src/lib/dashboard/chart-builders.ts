import { executeAnalyticalQuery } from '../analytics/duckdb-engine.js';
import type { DatasetEdaSummary } from '../analytics/eda-types.js';
import {
  type ChartSpec,
  MAX_CHARTS_PER_DASHBOARD,
} from './types.js';

/**
 * Builds categorical distribution charts (donut for <= 5 categories, bar for larger sets).
 */
export function buildCategoricalCharts(
  eda: DatasetEdaSummary,
  limit = MAX_CHARTS_PER_DASHBOARD
): ChartSpec[] {
  const charts: ChartSpec[] = [];

  for (const cat of eda.categoricalDistributions) {
    if (charts.length >= limit) break;
    if (cat.isConstant || cat.isHighCardinality || cat.topValues.length === 0) continue;

    const chartTitle = `${cat.column.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} Distribution`;
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
            data: cat.topValues.map((v: { value: string; count: number }) => ({
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
        categories: cat.topValues.map((v: { value: string }) => v.value),
        series: [
          {
            name: 'Record Count',
            data: cat.topValues.map((v: { count: number }) => v.count),
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

  return charts;
}

/**
 * Builds time series trend charts (line charts with statistical anomaly markers).
 */
export function buildTimeSeriesCharts(
  eda: DatasetEdaSummary,
  limit = MAX_CHARTS_PER_DASHBOARD
): ChartSpec[] {
  const charts: ChartSpec[] = [];

  for (const temp of eda.temporalAnalyses) {
    if (charts.length >= limit) break;
    if (temp.dataPoints.length < 2) continue;

    const anomalyMarkers = temp.anomalousPeriods.map((p: string) => {
      const pt = temp.dataPoints.find((dp: { period: string }) => dp.period === p);
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
      categories: temp.dataPoints.map((p: { period: string }) => p.period),
      series: [
        {
          name: temp.dataPoints[0]?.metricSum !== undefined ? 'Aggregated Metric' : 'Activity Volume',
          data: temp.dataPoints.map((p: { metricSum?: number; count: number }) => p.metricSum ?? p.count),
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

  return charts;
}

/**
 * Builds histogram charts for continuous numeric distributions and outlier detection.
 */
export async function buildHistogramCharts(
  eda: DatasetEdaSummary,
  datasetPath: string,
  customBaseDir?: string,
  limit = MAX_CHARTS_PER_DASHBOARD
): Promise<ChartSpec[]> {
  const charts: ChartSpec[] = [];

  for (const num of eda.numericDistributions) {
    if (charts.length >= limit) break;
    if (num.isConstant || num.count < 4 || num.min === null || num.max === null) continue;

    const bucketCount = Math.min(8, Math.max(4, Math.floor(Math.sqrt(num.count))));
    const minVal = num.min;
    const maxVal = num.max;
    const binWidth = (maxVal - minVal) / bucketCount;

    if (binWidth <= 0) continue;

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
        { datasetPath, sql: bucketsSql },
        { customBaseDir }
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

  return charts;
}

/**
 * Builds bivariate scatter plot for correlated continuous numeric pairs.
 */
export async function buildScatterCharts(
  eda: DatasetEdaSummary,
  datasetPath: string,
  customBaseDir?: string,
  limit = MAX_CHARTS_PER_DASHBOARD
): Promise<ChartSpec[]> {
  const charts: ChartSpec[] = [];
  if (eda.correlations.length === 0 || limit <= 0) return charts;

  const primaryCorr = eda.correlations[0]!;
  try {
    const scatterSql = `
      SELECT "${primaryCorr.columnA}" as x_val, "${primaryCorr.columnB}" as y_val
      FROM dataset
      WHERE "${primaryCorr.columnA}" IS NOT NULL AND "${primaryCorr.columnB}" IS NOT NULL
      LIMIT 1000;
    `;

    const scatterRes = await executeAnalyticalQuery(
      { datasetPath, sql: scatterSql },
      { customBaseDir }
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
    // Safe fallback
  }

  return charts;
}

/**
 * Builds adaptive charts (categorical distribution, time series trend, histogram, and scatter).
 */
export async function buildDashboardCharts(
  eda: DatasetEdaSummary,
  datasetPath: string,
  customBaseDir?: string
): Promise<ChartSpec[]> {
  const charts: ChartSpec[] = [];

  // Chart Type A: Categorical Distribution (Bar or Donut)
  charts.push(...buildCategoricalCharts(eda, MAX_CHARTS_PER_DASHBOARD - charts.length));

  // Chart Type B: Time Series Trend (Line Chart with Anomaly Markers)
  if (charts.length < MAX_CHARTS_PER_DASHBOARD) {
    charts.push(...buildTimeSeriesCharts(eda, MAX_CHARTS_PER_DASHBOARD - charts.length));
  }

  // Chart Type C: Numeric Distribution & Outlier Detection (Histogram)
  if (charts.length < MAX_CHARTS_PER_DASHBOARD) {
    const histCharts = await buildHistogramCharts(
      eda,
      datasetPath,
      customBaseDir,
      MAX_CHARTS_PER_DASHBOARD - charts.length
    );
    charts.push(...histCharts);
  }

  // Chart Type D: Bivariate Scatter Plot for Correlated Numeric Pairs
  if (charts.length < MAX_CHARTS_PER_DASHBOARD) {
    const scatterCharts = await buildScatterCharts(
      eda,
      datasetPath,
      customBaseDir,
      MAX_CHARTS_PER_DASHBOARD - charts.length
    );
    charts.push(...scatterCharts);
  }

  return charts;
}
