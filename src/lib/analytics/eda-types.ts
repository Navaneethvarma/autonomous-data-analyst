import { z } from 'zod';

export const EDA_SCHEMA_VERSION = '1.0.0';

/**
 * Numeric distribution statistics calculated via DuckDB.
 */
export const NumericDistributionSchema = z.object({
  column: z.string(),
  count: z.number(),
  nullCount: z.number(),
  nullPercentage: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  median: z.number().nullable(),
  stdDev: z.number().nullable(),
  variance: z.number().nullable(),
  p25: z.number().nullable(),
  p75: z.number().nullable(),
  iqr: z.number().nullable(),
  skewness: z.number().nullable(),
  kurtosis: z.number().nullable(),
  isConstant: z.boolean(),
  outlierCount: z.number(),
  outlierPercentage: z.number(),
  outlierBounds: z.object({
    lowerBound: z.number().nullable(),
    upperBound: z.number().nullable(),
  }),
});

export type NumericDistribution = z.infer<typeof NumericDistributionSchema>;

/**
 * Categorical value frequency.
 */
export const CategoryFrequencySchema = z.object({
  value: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export type CategoryFrequency = z.infer<typeof CategoryFrequencySchema>;

/**
 * Categorical distribution and cardinality metrics.
 */
export const CategoricalDistributionSchema = z.object({
  column: z.string(),
  totalCount: z.number(),
  nullCount: z.number(),
  nullPercentage: z.number(),
  distinctCount: z.number(),
  uniqueRatio: z.number(), // distinctCount / nonNullCount
  isConstant: z.boolean(),
  isHighCardinality: z.boolean(),
  mode: z.string().nullable(),
  modeCount: z.number().nullable(),
  topValues: z.array(CategoryFrequencySchema),
  concentrationPercentage: z.number().nullable(), // top 1 percentage
});

export type CategoricalDistribution = z.infer<typeof CategoricalDistributionSchema>;

/**
 * Temporal aggregation point for trend evaluation.
 */
export const TemporalDataPointSchema = z.object({
  period: z.string(),
  count: z.number(),
  metricSum: z.number().optional(),
});

export type TemporalDataPoint = z.infer<typeof TemporalDataPointSchema>;

/**
 * Time-series trend and seasonality assessment.
 */
export const TemporalAnalysisSchema = z.object({
  dateColumn: z.string(),
  minDate: z.string(),
  maxDate: z.string(),
  rangeDays: z.number(),
  totalRecords: z.number(),
  periodType: z.enum(['daily', 'weekly', 'monthly']),
  trendDirection: z.enum(['increasing', 'decreasing', 'flat', 'volatile', 'insufficient_data']),
  growthRatePercentage: z.number().nullable(),
  dataPoints: z.array(TemporalDataPointSchema),
  anomalousPeriods: z.array(z.string()),
});

export type TemporalAnalysis = z.infer<typeof TemporalAnalysisSchema>;

/**
 * Pairwise Pearson correlation between two numeric columns.
 */
export const CorrelationResultSchema = z.object({
  columnA: z.string(),
  columnB: z.string(),
  sampleSize: z.number(),
  pearsonCoefficient: z.number(),
  strength: z.enum([
    'strong_positive',
    'moderate_positive',
    'weak_positive',
    'neutral',
    'weak_negative',
    'moderate_negative',
    'strong_negative',
    'undefined',
  ]),
  causationCaveat: z.string(),
});

export type CorrelationResult = z.infer<typeof CorrelationResultSchema>;

/**
 * Specific data quality or statistical risk flagged during EDA.
 */
export const QualityIssueSeveritySchema = z.enum(['critical', 'warning', 'info']);
export type QualityIssueSeverity = z.infer<typeof QualityIssueSeveritySchema>;

export const QualityIssueTypeSchema = z.enum([
  'high_missingness',
  'complete_missingness',
  'constant_column',
  'high_cardinality',
  'severe_skewness',
  'heavy_outliers',
  'small_sample_size',
  'zero_variance',
  'empty_dataset',
]);
export type QualityIssueType = z.infer<typeof QualityIssueTypeSchema>;

export const DataQualityIssueSchema = z.object({
  type: QualityIssueTypeSchema,
  severity: QualityIssueSeveritySchema,
  column: z.string().optional(),
  message: z.string(),
  metricValue: z.number().optional(),
});

export type DataQualityIssue = z.infer<typeof DataQualityIssueSchema>;

/**
 * Complete dataset exploratory analysis summary.
 */
export const DatasetEdaSummarySchema = z.object({
  datasetName: z.string(),
  rowCount: z.number(),
  columnCount: z.number(),
  completenessScore: z.number(), // 0 to 100%
  numericDistributions: z.array(NumericDistributionSchema),
  categoricalDistributions: z.array(CategoricalDistributionSchema),
  temporalAnalyses: z.array(TemporalAnalysisSchema),
  correlations: z.array(CorrelationResultSchema),
  qualityIssues: z.array(DataQualityIssueSchema),
  analyzedAt: z.string(),
  executionTimeMs: z.number(),
});

export type DatasetEdaSummary = z.infer<typeof DatasetEdaSummarySchema>;

/**
 * Ranked business insight.
 */
export const InsightCategorySchema = z.enum([
  'revenue_concentration',
  'trend_and_growth',
  'anomaly_detection',
  'correlation_analysis',
  'data_quality_risk',
  'operational_performance',
  'category_distribution',
]);
export type InsightCategory = z.infer<typeof InsightCategorySchema>;

export const InsightImportanceSchema = z.enum(['critical', 'high', 'medium', 'low']);
export type InsightImportance = z.infer<typeof InsightImportanceSchema>;

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const BusinessInsightSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: InsightCategorySchema,
  importance: InsightImportanceSchema,
  observedFact: z.string(),
  hypothesis: z.string(),
  recommendation: z.string(),
  affectedColumns: z.array(z.string()),
  supportingMetrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  analyticalMethod: z.string(),
  confidence: ConfidenceLevelSchema,
  confidenceReason: z.string(),
  limitations: z.array(z.string()),
});

export type BusinessInsight = z.infer<typeof BusinessInsightSchema>;

/**
 * Versioned EDA and automated business insight output schema.
 */
export const EdaAndInsightsResultSchema = z.object({
  version: z.literal(EDA_SCHEMA_VERSION),
  dataset: z.string(),
  eda: DatasetEdaSummarySchema,
  insights: z.array(BusinessInsightSchema),
  provenance: z.object({
    datasetFile: z.string(),
    analyzedAt: z.string(),
    executionTimeMs: z.number(),
    engine: z.string(),
  }),
});

export type EdaAndInsightsResult = z.infer<typeof EdaAndInsightsResultSchema>;

export const RunAutomatedEdaInputSchema = z.object({
  datasetPath: z.string().min(1, 'Dataset file path is required'),
  includeCorrelations: z.boolean().optional(),
  temporalDateColumn: z.string().optional(),
  temporalMetricColumn: z.string().optional(),
});

export type RunAutomatedEdaInput = z.input<typeof RunAutomatedEdaInputSchema>;
export type RunAutomatedEdaParsedInput = z.output<typeof RunAutomatedEdaInputSchema>;
