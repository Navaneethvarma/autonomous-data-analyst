import { z } from 'zod';
import { QualityIssueSeveritySchema } from '../analytics/eda-types.js';

export const REPORT_SCHEMA_VERSION = '1.0.0';

/**
 * Report metadata and scope definition.
 */
export const ReportMetadataSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  datasetName: z.string().min(1),
  datasetRowCount: z.number().nonnegative(),
  datasetColumnCount: z.number().nonnegative(),
  reportingPeriod: z.object({
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number().nonnegative(),
    periodType: z.enum(['daily', 'weekly', 'monthly', 'unspecified']),
  }).optional(),
  generatedAt: z.string(),
  author: z.string(),
  engine: z.string(),
  scope: z.string().max(600),
  isAggregateComplete: z.boolean(),
  completenessScore: z.number().min(0).max(100),
});

export type ReportMetadata = z.infer<typeof ReportMetadataSchema>;

/**
 * Executive Summary bullet points and headline takeaway.
 */
export const ExecutiveSummarySchema = z.object({
  headline: z.string().min(1).max(300),
  primaryTakeaways: z.array(z.string().min(1).max(600)).min(1).max(10),
  businessImplications: z.array(z.string().min(1).max(600)).max(6),
  dataTrustRating: z.enum(['high', 'moderate', 'caution', 'unreliable']),
  dataTrustSummary: z.string().max(500),
});

export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

/**
 * KPI Metric Card for Executive Summary.
 */
export const ReportKpiMetricSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  value: z.union([z.number(), z.string()]),
  formattedValue: z.string(),
  unit: z.string().optional(),
  definition: z.string().max(300),
  changePercentage: z.number().optional(),
  comparisonPeriod: z.string().optional(),
  trendDirection: z.enum(['up', 'down', 'flat', 'neutral']),
  status: z.enum(['positive', 'warning', 'negative', 'neutral']),
  evidenceRef: z.string(),
});

export type ReportKpiMetric = z.infer<typeof ReportKpiMetricSchema>;

/**
 * Data Quality and Completeness Scorecard.
 */
export const QualityScorecardItemSchema = z.object({
  column: z.string(),
  dataType: z.string(),
  completenessPercentage: z.number().min(0).max(100),
  nullCount: z.number().nonnegative(),
  distinctCount: z.number().nonnegative().optional(),
  issues: z.array(z.string()),
  severity: QualityIssueSeveritySchema,
});

export type QualityScorecardItem = z.infer<typeof QualityScorecardItemSchema>;

export const QualityAssessmentSectionSchema = z.object({
  overallScore: z.number().min(0).max(100),
  status: z.enum(['good', 'acceptable', 'degraded', 'poor']),
  totalRecords: z.number().nonnegative(),
  totalColumns: z.number().nonnegative(),
  columnsWithNullsCount: z.number().nonnegative(),
  summaryNotes: z.array(z.string()),
  scorecard: z.array(QualityScorecardItemSchema),
});

export type QualityAssessmentSection = z.infer<typeof QualityAssessmentSectionSchema>;

/**
 * Key Finding separating observed facts, hypotheses, and recommendations.
 */
export const ReportFindingSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  importance: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  observedFact: z.string().min(1),
  hypothesis: z.string().min(1),
  recommendedAction: z.string().min(1),
  supportingMetrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  confidence: z.enum(['high', 'medium', 'low']),
  confidenceReason: z.string(),
  limitations: z.array(z.string()),
});

export type ReportFinding = z.infer<typeof ReportFindingSchema>;

/**
 * Report Chart representation (vector SVG / print-ready).
 */
export const ReportChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  secondaryValue: z.number().optional(),
  category: z.string().optional(),
});

export type ReportChartDataPoint = z.infer<typeof ReportChartDataPointSchema>;

export const ReportChartSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(150),
  subtitle: z.string().max(250).optional(),
  chartType: z.enum(['bar', 'horizontal_bar', 'line', 'donut', 'histogram']),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  data: z.array(ReportChartDataPointSchema).max(50),
  caption: z.string().max(500),
  evidenceRef: z.string(),
});

export type ReportChart = z.infer<typeof ReportChartSchema>;

/**
 * Report Table representation with formatted data.
 */
export const ReportTableColumnSchema = z.object({
  key: z.string(),
  header: z.string(),
  align: z.enum(['left', 'center', 'right']).default('left'),
});

export type ReportTableColumn = z.infer<typeof ReportTableColumnSchema>;

export const ReportTableSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(150),
  columns: z.array(ReportTableColumnSchema),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(100),
  caption: z.string().max(500),
  isTruncated: z.boolean().default(false),
  totalRowsAvailable: z.number().nonnegative().optional(),
});

export type ReportTable = z.infer<typeof ReportTableSchema>;

/**
 * Statistical Analysis section (Trends, Outliers, Correlations).
 */
export const CorrelationFindingSchema = z.object({
  variableA: z.string(),
  variableB: z.string(),
  pearsonCoefficient: z.number().min(-1).max(1),
  sampleSize: z.number().positive(),
  interpretation: z.string(),
  causationCaveat: z.string(),
});

export type CorrelationFinding = z.infer<typeof CorrelationFindingSchema>;

export const OutlierFindingSchema = z.object({
  column: z.string(),
  outlierCount: z.number().nonnegative(),
  outlierPercentage: z.number().min(0).max(100),
  lowerBound: z.number().nullable(),
  upperBound: z.number().nullable(),
  businessImplication: z.string(),
});

export type OutlierFinding = z.infer<typeof OutlierFindingSchema>;

export const StatisticalAnalysisSectionSchema = z.object({
  trendsSummary: z.string().optional(),
  correlations: z.array(CorrelationFindingSchema),
  outliers: z.array(OutlierFindingSchema),
  nonCausationNotice: z.string(),
});

export type StatisticalAnalysisSection = z.infer<typeof StatisticalAnalysisSectionSchema>;

/**
 * Methodology and Data Provenance.
 */
export const MethodologySectionSchema = z.object({
  analyticalEngine: z.string(),
  profilingMethod: z.string(),
  statisticalTechniques: z.array(z.string()),
  filtersApplied: z.array(z.string()),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  dataProvenance: z.object({
    sourcePath: z.string(),
    analyzedAt: z.string(),
    hashOrVersion: z.string().optional(),
    executionDurationMs: z.number().nonnegative(),
  }),
});

export type MethodologySection = z.infer<typeof MethodologySectionSchema>;

/**
 * Appendix item for statistical formulas and definitions.
 */
export const AppendixItemSchema = z.object({
  term: z.string(),
  formulaOrRule: z.string().optional(),
  explanation: z.string(),
});

export type AppendixItem = z.infer<typeof AppendixItemSchema>;

/**
 * Root Executive Business Report Specification Contract.
 */
export const ReportSpecSchema = z.object({
  version: z.literal(REPORT_SCHEMA_VERSION),
  metadata: ReportMetadataSchema,
  executiveSummary: ExecutiveSummarySchema,
  kpis: z.array(ReportKpiMetricSchema).max(12),
  qualityAssessment: QualityAssessmentSectionSchema,
  findings: z.array(ReportFindingSchema),
  charts: z.array(ReportChartSchema),
  tables: z.array(ReportTableSchema),
  statisticalAnalysis: StatisticalAnalysisSectionSchema,
  methodology: MethodologySectionSchema,
  appendix: z.array(AppendixItemSchema),
});

export type ReportSpec = z.infer<typeof ReportSpecSchema>;
