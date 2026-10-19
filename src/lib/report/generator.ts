import path from 'node:path';
import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import type {
  EdaAndInsightsResult,
  DatasetEdaSummary,
  BusinessInsight,
} from '../analytics/eda-types.js';
import {
  REPORT_SCHEMA_VERSION,
  ReportSpecSchema,
  type ReportSpec,
  type ReportKpiMetric,
  type QualityScorecardItem,
  type ReportFinding,
  type ReportChart,
  type ReportTable,
  type CorrelationFinding,
  type OutlierFinding,
} from './types.js';

export interface GenerateReportOptions {
  title?: string;
  subtitle?: string;
  scope?: string;
  author?: string;
  temporalDateColumn?: string;
  temporalMetricColumn?: string;
}

/**
 * Formats a numeric value with standard commas, decimals, or currency if column indicates monetary value.
 */
function formatMetricValue(val: number | null | undefined, colName?: string): string {
  if (val === null || val === undefined) return 'N/A';
  const isCurrency = colName && /revenue|sales|price|cost|profit|spend|budget|amount|fee/i.test(colName);
  
  if (Math.abs(val) >= 1_000_000) {
    const formatted = (val / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return isCurrency ? `$${formatted}M` : `${formatted}M`;
  }
  if (Math.abs(val) >= 1_000) {
    const formatted = val.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return isCurrency ? `$${formatted}` : formatted;
  }
  if (Number.isInteger(val)) {
    return isCurrency ? `$${val}` : `${val}`;
  }
  return isCurrency ? `$${val.toFixed(2)}` : val.toFixed(2);
}

/**
 * Pure generator that constructs a verified ReportSpec from computed EDA results.
 */
export function buildReportSpecFromEda(
  input: EdaAndInsightsResult | DatasetEdaSummary,
  options?: GenerateReportOptions
): ReportSpec {
  let eda: DatasetEdaSummary;
  let insights: BusinessInsight[];
  let provenance: { datasetFile: string; analyzedAt: string; executionTimeMs: number; engine: string };

  if ('eda' in input && 'insights' in input && 'provenance' in input) {
    eda = input.eda;
    insights = input.insights;
    provenance = input.provenance;
  } else {
    eda = input as DatasetEdaSummary;
    insights = generateBusinessInsights(eda);
    provenance = {
      datasetFile: eda.datasetName,
      analyzedAt: eda.analyzedAt,
      executionTimeMs: eda.executionTimeMs,
      engine: 'DuckDB Embedded SQL & Statistical Profiler',
    };
  }

  const datasetName = eda.datasetName || (provenance?.datasetFile ? path.basename(provenance.datasetFile) : 'Dataset');
  const nowIso = new Date().toISOString();

  // 1. Reporting Period from Temporal Analyses if present
  let reportingPeriod: ReportSpec['metadata']['reportingPeriod'] = undefined;
  const primaryTemporal = eda.temporalAnalyses.length > 0 ? eda.temporalAnalyses[0] : undefined;
  if (primaryTemporal && primaryTemporal.minDate && primaryTemporal.maxDate) {
    reportingPeriod = {
      startDate: primaryTemporal.minDate,
      endDate: primaryTemporal.maxDate,
      durationDays: primaryTemporal.rangeDays,
      periodType: primaryTemporal.periodType,
    };
  }

  // 2. Metadata
  const metadata: ReportSpec['metadata'] = {
    id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: options?.title || `Executive Analytics Report: ${datasetName}`,
    subtitle: options?.subtitle || 'Evidence-backed exploratory analytics, KPI summary, and strategic findings',
    datasetName,
    datasetRowCount: eda.rowCount,
    datasetColumnCount: eda.columnCount,
    reportingPeriod,
    generatedAt: nowIso,
    author: options?.author || 'Autonomous Data Analyst (Mastra Agent)',
    engine: provenance.engine || 'DuckDB Embedded SQL & Statistical Profiler',
    scope: options?.scope || `Comprehensive exploratory data analysis across ${eda.rowCount.toLocaleString()} records and ${eda.columnCount} attributes.`,
    isAggregateComplete: true,
    completenessScore: eda.completenessScore,
  };

  // 3. Executive Summary
  const topInsights = insights.slice(0, 5);
  const primaryTakeaways: string[] = topInsights.length > 0
    ? topInsights.map(ins => `${ins.title}: ${ins.observedFact}`)
    : [`Dataset contains ${eda.rowCount.toLocaleString()} records across ${eda.columnCount} columns with ${eda.completenessScore}% overall completeness.`];

  const businessImplications: string[] = topInsights
    .filter(ins => Boolean(ins.recommendation))
    .map(ins => ins.recommendation)
    .slice(0, 4);

  let dataTrustRating: ReportSpec['executiveSummary']['dataTrustRating'] = 'high';
  if (eda.completenessScore < 70 || eda.qualityIssues.some(q => q.severity === 'critical')) {
    dataTrustRating = 'caution';
  } else if (eda.completenessScore < 90 || eda.qualityIssues.some(q => q.severity === 'warning')) {
    dataTrustRating = 'moderate';
  }

  const executiveSummary: ReportSpec['executiveSummary'] = {
    headline: topInsights[0]?.observedFact || `Overall dataset profile reveals ${eda.rowCount.toLocaleString()} complete records with ${eda.completenessScore}% completeness score.`,
    primaryTakeaways,
    businessImplications: businessImplications.length > 0 ? businessImplications : ['Review baseline data distributions and address identified quality warnings.'],
    dataTrustRating,
    dataTrustSummary: `Evaluated over ${eda.rowCount.toLocaleString()} rows. Data completeness score is ${eda.completenessScore}%. ${eda.qualityIssues.length} quality notices identified.`,
  };

  // 4. Executive KPIs (maximum 8)
  const kpis: ReportKpiMetric[] = [];
  // Row count KPI
  kpis.push({
    id: 'kpi-records',
    name: 'Total Records',
    value: eda.rowCount,
    formattedValue: eda.rowCount.toLocaleString(),
    definition: 'Total validated rows analyzed across the dataset.',
    trendDirection: 'neutral',
    status: 'neutral',
    evidenceRef: 'eda.rowCount',
  });

  // Completeness score KPI
  kpis.push({
    id: 'kpi-completeness',
    name: 'Completeness Score',
    value: eda.completenessScore,
    formattedValue: `${eda.completenessScore.toFixed(1)}%`,
    unit: '%',
    definition: 'Ratio of non-null cells to total cells across all rows and columns.',
    trendDirection: eda.completenessScore >= 95 ? 'up' : eda.completenessScore >= 80 ? 'neutral' : 'down',
    status: eda.completenessScore >= 95 ? 'positive' : eda.completenessScore >= 80 ? 'neutral' : 'warning',
    evidenceRef: 'eda.completenessScore',
  });

  // Primary numeric metrics (e.g. revenue, amount, or first 2 numeric columns)
  for (const num of eda.numericDistributions.slice(0, 4)) {
    if (num.mean !== null && num.count > 0) {
      kpis.push({
        id: `kpi-mean-${num.column}`,
        name: `Mean ${num.column}`,
        value: num.mean,
        formattedValue: formatMetricValue(num.mean, num.column),
        definition: `Arithmetic mean computed across ${num.count.toLocaleString()} non-null values.`,
        trendDirection: 'neutral',
        status: num.outlierPercentage > 5 ? 'warning' : 'neutral',
        evidenceRef: `eda.numericDistributions.${num.column}.mean`,
      });
    }
  }

  // Temporal growth rate if present and supported
  if (primaryTemporal && primaryTemporal.growthRatePercentage !== null) {
    kpis.push({
      id: 'kpi-temporal-growth',
      name: 'Period Growth Rate',
      value: primaryTemporal.growthRatePercentage,
      formattedValue: `${primaryTemporal.growthRatePercentage >= 0 ? '+' : ''}${primaryTemporal.growthRatePercentage.toFixed(1)}%`,
      unit: '%',
      definition: `Observed trend direction: ${primaryTemporal.trendDirection} across ${primaryTemporal.dataPoints.length} temporal buckets.`,
      trendDirection: primaryTemporal.trendDirection === 'increasing' ? 'up' : primaryTemporal.trendDirection === 'decreasing' ? 'down' : 'flat',
      status: primaryTemporal.trendDirection === 'increasing' ? 'positive' : primaryTemporal.trendDirection === 'decreasing' ? 'negative' : 'neutral',
      evidenceRef: `eda.temporalAnalyses.${primaryTemporal.dateColumn}.growthRatePercentage`,
      changePercentage: primaryTemporal.growthRatePercentage,
      comparisonPeriod: `${primaryTemporal.minDate} to ${primaryTemporal.maxDate}`,
    });
  }

  // 5. Data Quality Scorecard
  const scorecard: QualityScorecardItem[] = [];
  const columnIssuesMap = new Map<string, string[]>();
  for (const issue of eda.qualityIssues) {
    if (issue.column) {
      const existing = columnIssuesMap.get(issue.column) || [];
      existing.push(issue.message);
      columnIssuesMap.set(issue.column, existing);
    }
  }

  // Populate numeric columns
  for (const num of eda.numericDistributions) {
    const issues = columnIssuesMap.get(num.column) || [];
    let severity: QualityScorecardItem['severity'] = 'info';
    if (num.nullPercentage > 20 || num.outlierPercentage > 10) severity = 'warning';
    if (num.nullPercentage > 50) severity = 'critical';

    scorecard.push({
      column: num.column,
      dataType: 'NUMERIC',
      completenessPercentage: Number((100 - num.nullPercentage).toFixed(1)),
      nullCount: num.nullCount,
      issues,
      severity,
    });
  }

  // Populate categorical columns
  for (const cat of eda.categoricalDistributions) {
    const issues = columnIssuesMap.get(cat.column) || [];
    let severity: QualityScorecardItem['severity'] = 'info';
    if (cat.nullPercentage > 20 || cat.isHighCardinality) severity = 'warning';
    if (cat.nullPercentage > 50) severity = 'critical';

    scorecard.push({
      column: cat.column,
      dataType: 'CATEGORICAL',
      completenessPercentage: Number((100 - cat.nullPercentage).toFixed(1)),
      nullCount: cat.nullCount,
      distinctCount: cat.distinctCount,
      issues,
      severity,
    });
  }

  const columnsWithNulls = scorecard.filter(s => s.nullCount > 0).length;
  let overallQualityStatus: ReportSpec['qualityAssessment']['status'] = 'good';
  if (eda.completenessScore < 75 || eda.qualityIssues.some(q => q.severity === 'critical')) {
    overallQualityStatus = 'degraded';
  } else if (eda.completenessScore < 90 || eda.qualityIssues.some(q => q.severity === 'warning')) {
    overallQualityStatus = 'acceptable';
  }

  const qualityAssessment: ReportSpec['qualityAssessment'] = {
    overallScore: eda.completenessScore,
    status: overallQualityStatus,
    totalRecords: eda.rowCount,
    totalColumns: eda.columnCount,
    columnsWithNullsCount: columnsWithNulls,
    summaryNotes: eda.qualityIssues.map(q => `[${q.severity.toUpperCase()}] ${q.column ? `${q.column}: ` : ''}${q.message}`),
    scorecard,
  };

  // 6. Key Findings (facts, hypotheses, recommended actions)
  const findings: ReportFinding[] = insights.map((ins, idx) => ({
    id: `finding-${idx + 1}`,
    title: ins.title,
    importance: ins.importance,
    category: ins.category,
    observedFact: ins.observedFact,
    hypothesis: ins.hypothesis,
    recommendedAction: ins.recommendation,
    supportingMetrics: ins.supportingMetrics,
    confidence: ins.confidence,
    confidenceReason: ins.confidenceReason,
    limitations: ins.limitations,
  }));

  // 7. Visual Charts (print-ready SVG data)
  const charts: ReportChart[] = [];

  // Categorical distribution chart
  const cat = eda.categoricalDistributions[0];
  if (cat) {
    const chartData = cat.topValues.slice(0, 10).map(tv => ({
      label: tv.value || '(blank)',
      value: tv.count,
    }));

    charts.push({
      id: `chart-cat-${cat.column}`,
      title: `Distribution by ${cat.column}`,
      subtitle: `Frequency distribution across top ${chartData.length} distinct categories`,
      chartType: 'bar',
      xAxisLabel: cat.column,
      yAxisLabel: 'Record Count',
      data: chartData,
      caption: `Shows volume concentration for column '${cat.column}'. Mode is '${cat.mode ?? 'N/A'}' representing ${cat.concentrationPercentage ?? 0}% of records. Note: counts represent volume, not revenue unless explicitly aggregated.`,
      evidenceRef: `eda.categoricalDistributions.${cat.column}.topValues`,
    });
  }

  // Temporal trend chart if temporal data exists
  if (primaryTemporal && primaryTemporal.dataPoints.length > 0) {
    const timeData = primaryTemporal.dataPoints.map(dp => ({
      label: dp.period,
      value: dp.metricSum !== undefined ? dp.metricSum : dp.count,
    }));

    charts.push({
      id: `chart-temporal-${primaryTemporal.dateColumn}`,
      title: `Temporal Trend: ${primaryTemporal.dateColumn}`,
      subtitle: `${primaryTemporal.periodType.toUpperCase()} aggregation from ${primaryTemporal.minDate} to ${primaryTemporal.maxDate}`,
      chartType: 'line',
      xAxisLabel: 'Period',
      yAxisLabel: primaryTemporal.dataPoints[0]?.metricSum !== undefined ? 'Aggregated Metric Sum' : 'Transaction Count',
      data: timeData,
      caption: `Temporal trend across ${primaryTemporal.dataPoints.length} periods. Overall observed direction is '${primaryTemporal.trendDirection}' with calculated growth rate of ${primaryTemporal.growthRatePercentage ?? 0}%.`,
      evidenceRef: `eda.temporalAnalyses.${primaryTemporal.dateColumn}.dataPoints`,
    });
  }

  // Numeric distribution / Outlier chart
  const num = eda.numericDistributions[0];
  if (num) {
    const dataPoints = [
      { label: 'Min', value: num.min ?? 0 },
      { label: 'P25', value: num.p25 ?? 0 },
      { label: 'Median', value: num.median ?? 0 },
      { label: 'Mean', value: num.mean ?? 0 },
      { label: 'P75', value: num.p75 ?? 0 },
      { label: 'Max', value: num.max ?? 0 },
    ];

    charts.push({
      id: `chart-num-${num.column}`,
      title: `Distribution Profile: ${num.column}`,
      subtitle: `Five-number summary and mean computed via DuckDB`,
      chartType: 'bar',
      xAxisLabel: 'Statistical Metric',
      yAxisLabel: num.column,
      data: dataPoints,
      caption: `Distribution profile for '${num.column}'. Median = ${formatMetricValue(num.median, num.column)}, Mean = ${formatMetricValue(num.mean, num.column)}, IQR = ${num.iqr ?? 'N/A'}. ${num.outlierCount} outliers identified (${num.outlierPercentage.toFixed(1)}%).`,
      evidenceRef: `eda.numericDistributions.${num.column}`,
    });
  }

  // 8. Structured Tables
  const tables: ReportTable[] = [];

  // Table 1: Numeric Attributes Summary Table
  if (eda.numericDistributions.length > 0) {
    tables.push({
      id: 'table-numeric-summary',
      title: 'Numeric Attributes Summary Statistics',
      columns: [
        { key: 'column', header: 'Column', align: 'left' },
        { key: 'count', header: 'Count', align: 'right' },
        { key: 'nullPct', header: 'Null %', align: 'right' },
        { key: 'mean', header: 'Mean', align: 'right' },
        { key: 'median', header: 'Median', align: 'right' },
        { key: 'stdDev', header: 'Std Dev', align: 'right' },
        { key: 'min', header: 'Min', align: 'right' },
        { key: 'max', header: 'Max', align: 'right' },
        { key: 'outliers', header: 'Outliers', align: 'right' },
      ],
      rows: eda.numericDistributions.map(n => ({
        column: n.column,
        count: n.count.toLocaleString(),
        nullPct: `${n.nullPercentage.toFixed(1)}%`,
        mean: formatMetricValue(n.mean, n.column),
        median: formatMetricValue(n.median, n.column),
        stdDev: n.stdDev !== null ? n.stdDev.toFixed(2) : 'N/A',
        min: formatMetricValue(n.min, n.column),
        max: formatMetricValue(n.max, n.column),
        outliers: `${n.outlierCount} (${n.outlierPercentage.toFixed(1)}%)`,
      })),
      caption: 'Full-dataset summary metrics computed via DuckDB analytical SQL engine. Outliers computed using Tukey’s 1.5 IQR threshold.',
      isTruncated: false,
      totalRowsAvailable: eda.numericDistributions.length,
    });
  }

  // Table 2: Categorical Attributes Summary Table
  if (eda.categoricalDistributions.length > 0) {
    tables.push({
      id: 'table-categorical-summary',
      title: 'Categorical Attributes Summary',
      columns: [
        { key: 'column', header: 'Column', align: 'left' },
        { key: 'distinct', header: 'Distinct Values', align: 'right' },
        { key: 'nullPct', header: 'Null %', align: 'right' },
        { key: 'mode', header: 'Mode (Top Value)', align: 'left' },
        { key: 'modeCount', header: 'Mode Count', align: 'right' },
        { key: 'concentration', header: 'Top Value Share', align: 'right' },
      ],
      rows: eda.categoricalDistributions.map(c => ({
        column: c.column,
        distinct: c.distinctCount.toLocaleString(),
        nullPct: `${c.nullPercentage.toFixed(1)}%`,
        mode: c.mode ?? '(none)',
        modeCount: c.modeCount !== null ? c.modeCount.toLocaleString() : 'N/A',
        concentration: c.concentrationPercentage !== null ? `${c.concentrationPercentage.toFixed(1)}%` : 'N/A',
      })),
      caption: 'Categorical distribution summary. Unique ratios and mode concentrations computed across entire authorized dataset.',
      isTruncated: false,
      totalRowsAvailable: eda.categoricalDistributions.length,
    });
  }

  // 9. Statistical Analysis Section (Correlations and Outliers)
  const correlations: CorrelationFinding[] = eda.correlations.map(corr => ({
    variableA: corr.columnA,
    variableB: corr.columnB,
    pearsonCoefficient: Number(corr.pearsonCoefficient.toFixed(3)),
    sampleSize: corr.sampleSize,
    interpretation: `Observed Pearson correlation coefficient r = ${corr.pearsonCoefficient.toFixed(3)} indicates a ${corr.strength.replace(/_/g, ' ')} relationship across ${corr.sampleSize.toLocaleString()} paired observations.`,
    causationCaveat: corr.causationCaveat || 'Correlation does not imply causation. External confounding factors may account for the observed association.',
  }));

  const outliers: OutlierFinding[] = eda.numericDistributions
    .filter(n => n.outlierCount > 0)
    .map(n => ({
      column: n.column,
      outlierCount: n.outlierCount,
      outlierPercentage: Number(n.outlierPercentage.toFixed(1)),
      lowerBound: n.outlierBounds.lowerBound,
      upperBound: n.outlierBounds.upperBound,
      businessImplication: `${n.outlierCount} data point(s) exceed statistical bounds [${n.outlierBounds.lowerBound !== null ? n.outlierBounds.lowerBound.toFixed(2) : '-Inf'}, ${n.outlierBounds.upperBound !== null ? n.outlierBounds.upperBound.toFixed(2) : '+Inf'}]. Review for recording anomalies or high-impact tail events.`,
    }));

  const statisticalAnalysis: ReportSpec['statisticalAnalysis'] = {
    trendsSummary: primaryTemporal
      ? `Time-series assessment over '${primaryTemporal.dateColumn}' from ${primaryTemporal.minDate} to ${primaryTemporal.maxDate} demonstrated a ${primaryTemporal.trendDirection} direction across ${primaryTemporal.dataPoints.length} reporting intervals.`
      : 'No valid timestamp or date dimension detected in dataset for temporal trend modeling.',
    correlations,
    outliers,
    nonCausationNotice: 'CRITICAL STATISTICAL NOTICE: Correlation measures mathematical association between variables in this dataset. It does not establish cause-and-effect relationships or directionality. Business decisions should not assume that changing one variable will produce changes in correlated variables without controlled experimentation or causal identification.',
  };

  // 10. Methodology & Provenance
  const methodology: ReportSpec['methodology'] = {
    analyticalEngine: provenance.engine || 'DuckDB in-process OLAP engine',
    profilingMethod: 'Exhaustive streaming scan and exact SQL aggregation over complete dataset rows',
    statisticalTechniques: [
      'Exact quantile estimation via DuckDB QUANTILE_CONT',
      'Tukey 1.5x Interquartile Range (IQR) outlier boundary calculation',
      'Pearson correlation coefficient calculation on non-null numeric pairs',
      'Categorical cardinality and mode frequency evaluation',
    ],
    filtersApplied: ['None (unfiltered full dataset scope)'],
    assumptions: [
      'Missing values are treated as missing completely at random (MCAR) for distribution summaries unless otherwise noted.',
      'Dates and timestamps are parsed according to standard ISO-8601 or common database formats.',
      'Currency formatting is applied inferentially based on column naming conventions; underlying values are unit-agnostic decimals.',
    ],
    limitations: [
      'Analysis is strictly bounded by the data provided; unobserved confounding variables cannot be controlled.',
      'Dataset previews and sample visualizations are capped for readability, but all analytical figures reflect 100% of rows.',
      'Directional causation cannot be inferred from observed cross-sectional relationships.',
    ],
    dataProvenance: {
      sourcePath: provenance.datasetFile,
      analyzedAt: provenance.analyzedAt,
      executionDurationMs: provenance.executionTimeMs,
    },
  };

  // 11. Statistical Appendix
  const appendix: ReportSpec['appendix'] = [
    {
      term: 'Interquartile Range (IQR) Outlier Rule',
      formulaOrRule: 'Lower Bound = Q1 - (1.5 × IQR); Upper Bound = Q3 + (1.5 × IQR)',
      explanation: 'Identifies values that fall beyond 1.5 times the spread of the middle 50% of the distribution. Established by John Tukey for robust outlier detection resistant to extreme values.',
    },
    {
      term: 'Pearson Correlation Coefficient (r)',
      formulaOrRule: 'r = Σ((x - x̄)(y - ȳ)) / (√Σ(x - x̄)² × √Σ(y - ȳ)²)',
      explanation: 'Measures linear relationship strength between two continuous variables, bounded between -1.0 (perfect negative) and +1.0 (perfect positive). Does NOT imply causal relationship.',
    },
    {
      term: 'Completeness Score (%)',
      formulaOrRule: '(1 - (Total Null Cells / Total Cell Count)) × 100%',
      explanation: 'Measures overall dataset fill rate across all recorded rows and columns. Scores above 95% indicate high data completeness.',
    },
    {
      term: 'Categorical Mode Concentration (%)',
      formulaOrRule: '(Frequency of Most Frequent Value / Total Non-Null Count) × 100%',
      explanation: 'Indicates the dominance of the primary category. High concentration (>60%) flags potential class imbalance or monopolistic segments.',
    },
  ];

  const reportSpec: ReportSpec = {
    version: REPORT_SCHEMA_VERSION,
    metadata,
    executiveSummary,
    kpis,
    qualityAssessment,
    findings,
    charts,
    tables,
    statisticalAnalysis,
    methodology,
    appendix,
  };

  // Validate before returning
  return ReportSpecSchema.parse(reportSpec);
}

/**
 * End-to-end report generator: runs automated EDA on the dataset, then builds and validates the ReportSpec.
 */
export async function generateReportSpec(
  datasetPath: string,
  options?: GenerateReportOptions
): Promise<ReportSpec> {
  const edaResult = await runAutomatedEda({
    datasetPath,
    temporalDateColumn: options?.temporalDateColumn,
    temporalMetricColumn: options?.temporalMetricColumn,
    includeCorrelations: true,
  });

  return buildReportSpecFromEda(edaResult, options);
}
