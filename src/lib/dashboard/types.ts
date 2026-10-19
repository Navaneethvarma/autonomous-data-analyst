import { z } from 'zod';

export const DASHBOARD_SCHEMA_VERSION = '1.0.0';

export const MAX_CHARTS_PER_DASHBOARD = 16;
export const MAX_KPIS_PER_DASHBOARD = 8;
export const MAX_DATA_POINTS_PER_CHART = 5000;
export const MAX_TABLE_ROWS = 1000;
export const MAX_FILTERS = 6;

/**
 * Metadata identifying the dashboard provenance and underlying dataset.
 */
export const DashboardMetadataSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(150),
  description: z.string().max(500),
  datasetName: z.string(),
  datasetRowCount: z.number().nonnegative(),
  datasetColumnCount: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(100),
  isAggregateComplete: z.boolean(),
  isDisplayTruncated: z.boolean(),
  generatedAt: z.string(),
  engine: z.string(),
});

export type DashboardMetadata = z.infer<typeof DashboardMetadataSchema>;

/**
 * Executive KPI Headline Card Specification.
 */
export const KpiCardSpecSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  value: z.union([z.number(), z.string()]),
  formattedValue: z.string(),
  unit: z.string().optional(),
  change: z.number().optional(),
  changePeriod: z.string().optional(),
  trendDirection: z.enum(['up', 'down', 'flat', 'neutral']).default('neutral'),
  definition: z.string(),
  evidenceRef: z.string(),
  status: z.enum(['positive', 'warning', 'negative', 'neutral']).default('neutral'),
});

export type KpiCardSpec = z.infer<typeof KpiCardSpecSchema>;

/**
 * Supported chart types in the declarative dashboard renderer.
 */
export const ChartTypeSchema = z.enum([
  'bar',
  'line',
  'scatter',
  'donut',
  'histogram',
]);

export type ChartType = z.infer<typeof ChartTypeSchema>;

/**
 * Single data series within a chart.
 */
export const ChartSeriesSchema = z.object({
  name: z.string(),
  data: z.array(
    z.union([
      z.number(),
      z.object({
        name: z.string().optional(),
        value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
      }),
      z.tuple([z.union([z.number(), z.string()]), z.union([z.number(), z.string()])]),
    ])
  ).max(MAX_DATA_POINTS_PER_CHART),
  color: z.string().optional(),
});

export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

/**
 * Anomaly and outlier visual marker annotation.
 */
export const AnomalyMarkerSchema = z.object({
  periodOrLabel: z.string(),
  value: z.number(),
  note: z.string(),
});

export type AnomalyMarker = z.infer<typeof AnomalyMarkerSchema>;

/**
 * Chart specification.
 */
export const ChartSpecSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  description: z.string().max(400),
  chartType: ChartTypeSchema,
  categories: z.array(z.string()).optional(),
  series: z.array(ChartSeriesSchema),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  evidenceRef: z.string(),
  affectedColumns: z.array(z.string()),
  anomalyMarkers: z.array(AnomalyMarkerSchema).optional(),
  outlierBounds: z
    .object({
      lowerBound: z.number().nullable(),
      upperBound: z.number().nullable(),
    })
    .optional(),
  width: z.enum(['half', 'full', 'third']).default('half'),
  causationCaveat: z.string().optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/**
 * Pairwise correlation matrix specification.
 */
export const CorrelationMatrixEntrySchema = z.object({
  columnA: z.string(),
  columnB: z.string(),
  coefficient: z.number(),
  strength: z.string(),
  sampleSize: z.number(),
});

export const CorrelationMatrixSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(z.string()),
  matrix: z.array(CorrelationMatrixEntrySchema),
  causationWarning: z.string(),
  evidenceRef: z.string(),
});

export type CorrelationMatrixSpec = z.infer<typeof CorrelationMatrixSpecSchema>;

/**
 * Table column specification.
 */
export const TableColumnSpecSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean']),
});

export type TableColumnSpec = z.infer<typeof TableColumnSpecSchema>;

/**
 * Data table specification with sorting and pagination.
 */
export const TableSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(TableColumnSpecSchema),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(MAX_TABLE_ROWS),
  totalRowCount: z.number(),
  displayRowCount: z.number(),
  isTruncated: z.boolean(),
  pageSize: z.number().int().positive().default(10),
  defaultSortColumn: z.string().optional(),
  defaultSortDirection: z.enum(['asc', 'desc']).default('asc'),
});

export type TableSpec = z.infer<typeof TableSpecSchema>;

/**
 * Interactive filter specification.
 */
export const FilterSpecSchema = z.object({
  id: z.string(),
  column: z.string(),
  label: z.string(),
  type: z.enum(['category_select', 'status_select']),
  options: z.array(z.string()),
  defaultValue: z.string().optional(),
});

export type FilterSpec = z.infer<typeof FilterSpecSchema>;

/**
 * Grounded insight card for executive interpretation.
 */
export const InsightCardSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  importance: z.enum(['critical', 'high', 'medium', 'low']),
  observedFact: z.string(),
  hypothesis: z.string(),
  recommendation: z.string(),
  analyticalMethod: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  affectedColumns: z.array(z.string()),
  caveat: z.string().optional(),
});

export type InsightCardSpec = z.infer<typeof InsightCardSpecSchema>;

/**
 * Complete declarative, versioned Dashboard Specification schema.
 */
export const DashboardSpecSchema = z.object({
  version: z.literal(DASHBOARD_SCHEMA_VERSION),
  metadata: DashboardMetadataSchema,
  kpis: z.array(KpiCardSpecSchema).max(MAX_KPIS_PER_DASHBOARD),
  charts: z.array(ChartSpecSchema).max(MAX_CHARTS_PER_DASHBOARD),
  correlationMatrix: CorrelationMatrixSpecSchema.optional(),
  table: TableSpecSchema,
  filters: z.array(FilterSpecSchema).max(MAX_FILTERS),
  insights: z.array(InsightCardSpecSchema),
  guardrails: z.object({
    maxChartCount: z.number(),
    maxDataPointsPerChart: z.number(),
    maxTableRows: z.number(),
  }),
});

export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;

/**
 * Input schema for dashboard generation tool.
 */
export const GenerateDashboardSpecInputSchema = z.object({
  datasetPath: z.string().min(1, 'Dataset file path is required'),
  title: z.string().optional(),
  description: z.string().optional(),
  rowLimit: z.number().int().min(1).max(MAX_TABLE_ROWS).optional(),
});

export type GenerateDashboardSpecInput = z.input<typeof GenerateDashboardSpecInputSchema>;
export type GenerateDashboardSpecParsedInput = z.output<typeof GenerateDashboardSpecInputSchema>;
