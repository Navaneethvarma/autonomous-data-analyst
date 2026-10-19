import { z } from 'zod';

export const InferredDataTypeSchema = z.enum([
  'integer',
  'float',
  'boolean',
  'date',
  'datetime',
  'string',
]);

export type InferredDataType = z.infer<typeof InferredDataTypeSchema>;

export const NumericStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  median: z.number(),
  stdDev: z.number(),
  p25: z.number(),
  p75: z.number(),
});

export type NumericStats = z.infer<typeof NumericStatsSchema>;

export const CategoricalValueCountSchema = z.object({
  value: z.string(),
  count: z.number(),
});

export type CategoricalValueCount = z.infer<typeof CategoricalValueCountSchema>;

export const CategoricalStatsSchema = z.object({
  topValues: z.array(CategoricalValueCountSchema),
});

export type CategoricalStats = z.infer<typeof CategoricalStatsSchema>;

export const DateStatsSchema = z.object({
  minDate: z.string(),
  maxDate: z.string(),
});

export type DateStats = z.infer<typeof DateStatsSchema>;

export const ColumnProfileSchema = z.object({
  name: z.string(),
  inferredType: InferredDataTypeSchema,
  totalValues: z.number(),
  nonNullCount: z.number(),
  nullCount: z.number(),
  nullPercentage: z.number(),
  distinctCount: z.number(),
  numericStats: NumericStatsSchema.optional(),
  categoricalStats: CategoricalStatsSchema.optional(),
  dateStats: DateStatsSchema.optional(),
  warnings: z.array(z.string()),
});

export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;

export const WarningTypeSchema = z.enum([
  'constant_column',
  'high_null_percentage',
  'duplicate_rows',
  'empty_dataset',
  'suspicious_type',
  'duplicate_headers',
  'inconsistent_rows',
  'general',
]);

export type WarningType = z.infer<typeof WarningTypeSchema>;

export const DataQualityWarningSchema = z.object({
  type: WarningTypeSchema,
  column: z.string().optional(),
  message: z.string(),
});

export type DataQualityWarning = z.infer<typeof DataQualityWarningSchema>;

export const DatasetProfileSchema = z.object({
  fileName: z.string(),
  fileSizeBytes: z.number(),
  rowCount: z.number(),
  columnCount: z.number(),
  duplicateRowCount: z.number(),
  columns: z.array(ColumnProfileSchema),
  warnings: z.array(DataQualityWarningSchema),
  profiledAt: z.string(),
});

export type DatasetProfile = z.infer<typeof DatasetProfileSchema>;

export const profileDatasetInputSchema = z.object({
  filePath: z.string().min(1, 'File path must be provided'),
  maxDistinctValues: z.number().int().positive().optional().default(1000),
});

export type ProfileDatasetInput = z.infer<typeof profileDatasetInputSchema>;

export const profileDatasetOutputSchema = DatasetProfileSchema;
