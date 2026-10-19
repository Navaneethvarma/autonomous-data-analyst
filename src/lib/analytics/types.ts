import { z } from 'zod';

export const QueryParameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type QueryParameterValue = z.infer<typeof QueryParameterValueSchema>;

export const AnalyticalQueryInputSchema = z.object({
  datasetPath: z.string().min(1, 'Dataset file path is required'),
  sql: z.string().min(5, 'SQL query must be at least 5 characters'),
  parameters: z.array(QueryParameterValueSchema).optional(),
  tableAlias: z.string().optional(),
  rowLimit: z.number().int().min(1).max(5000).optional(),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
});

export type AnalyticalQueryInput = z.input<typeof AnalyticalQueryInputSchema>;
export type AnalyticalQueryParsedInput = z.output<typeof AnalyticalQueryInputSchema>;

export const QueryResultProvenanceSchema = z.object({
  datasetFile: z.string(),
  executedSql: z.string(),
  executedAt: z.string(),
  executionTimeMs: z.number(),
  rowLimitApplied: z.number(),
  isTruncated: z.boolean(),
  engine: z.string(),
});

export type QueryResultProvenance = z.infer<typeof QueryResultProvenanceSchema>;

export const AnalyticalQueryResultSchema = z.object({
  dataset: z.string(),
  sqlExecuted: z.string(),
  rowCount: z.number(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  executionTimeMs: z.number(),
  isTruncated: z.boolean(),
  provenance: QueryResultProvenanceSchema,
});

export type AnalyticalQueryResult = z.infer<typeof AnalyticalQueryResultSchema>;
