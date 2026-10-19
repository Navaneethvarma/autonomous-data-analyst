import { z } from 'zod';

/**
 * Supported Python analytical task types.
 */
export const PythonTaskTypeSchema = z.enum([
  'descriptive_stats',
  'group_comparison',
  'regression',
  'anova',
  'chi_square',
  'time_series',
  'custom_script',
]);
export type PythonTaskType = z.infer<typeof PythonTaskTypeSchema>;

/**
 * Execution and resource limits for the sandboxed Python runner.
 */
export const PythonExecutionLimitsSchema = z.object({
  /** Maximum wall-clock execution time in milliseconds (default: 10,000, max: 30,000) */
  timeoutMs: z.number().int().min(500).max(30000).default(10000),
  /** Maximum stdout/stderr output size in bytes (default: 512 KB, max: 2 MB) */
  maxOutputBytes: z.number().int().min(1024).max(2097152).default(524288),
  /** Maximum input rows to process to avoid memory exhaustion (default: 50,000) */
  maxRows: z.number().int().min(1).max(200000).default(50000),
});
export type PythonExecutionLimits = z.infer<typeof PythonExecutionLimitsSchema>;

/**
 * Request schema for sandboxed Python analysis.
 */
export const PythonAnalysisRequestSchema = z.object({
  /** Unique task identifier for tracing and caching */
  taskId: z.string().min(1),
  /** Analytical task to execute */
  taskType: PythonTaskTypeSchema,
  /** Authorized dataset ID registered in the dataset catalog */
  datasetId: z.string().min(1),
  /** Path to the dataset CSV or Parquet file (must be within authorized boundaries) */
  datasetPath: z.string().min(1),
  /** Columns authorized and required for this analysis */
  columns: z.array(z.string()).min(1),
  /** Analytical parameters specific to the task type */
  parameters: z.record(z.string(), z.any()).default({}),
  /** Optional Python code snippet when taskType is 'custom_script' (subject to AST safety checks) */
  code: z.string().optional(),
  /** Resource and timeout constraints */
  limits: PythonExecutionLimitsSchema.optional().default({
    timeoutMs: 10000,
    maxOutputBytes: 524288,
    maxRows: 50000,
  }),
});
export type PythonAnalysisRequest = z.input<typeof PythonAnalysisRequestSchema>;
export type PythonAnalysisRequestValidated = z.infer<typeof PythonAnalysisRequestSchema>;

/**
 * Statistical assumption check result.
 */
export const StatisticalAssumptionSchema = z.object({
  name: z.string(),
  satisfied: z.boolean(),
  details: z.string(),
  pValue: z.number().nullable().optional(),
});
export type StatisticalAssumption = z.infer<typeof StatisticalAssumptionSchema>;

/**
 * Sample size tracking for statistical rigor.
 */
export const StatisticalSampleSizeSchema = z.object({
  totalRows: z.number().int().nonnegative(),
  validObservations: z.number().int().nonnegative(),
  droppedOrMissing: z.number().int().nonnegative(),
  degreesOfFreedom: z.number().nullable().optional(),
});
export type StatisticalSampleSize = z.infer<typeof StatisticalSampleSizeSchema>;

/**
 * Provenance metadata to audit and trace Python execution results.
 */
export const PythonProvenanceSchema = z.object({
  datasetId: z.string(),
  datasetPath: z.string(),
  executionTimeMs: z.number().nonnegative(),
  timestamp: z.string(),
  pythonVersion: z.string(),
  librariesUsed: z.array(z.string()),
  workerSandboxType: z.enum(['process_isolated_subprocess', 'container_sandbox', 'restricted_subprocess_dev']),
  isolationLevel: z.enum(['development_restricted_subprocess', 'production_hardened_container']).default('development_restricted_subprocess'),
});
export type PythonProvenance = z.infer<typeof PythonProvenanceSchema>;

/**
 * Result schema for sandboxed Python analytics.
 */
export const PythonAnalysisResultSchema = z.object({
  contractVersion: z.literal('1.0.0').default('1.0.0'),
  status: z.enum(['success', 'error', 'timeout', 'validation_failed']),
  taskType: PythonTaskTypeSchema,
  /** Concise, objective statistical interpretation without unsubstantiated business claims */
  interpretation: z.string(),
  /** Explicit sample size numbers supporting the findings */
  sampleSize: StatisticalSampleSizeSchema,
  /** Defensible numeric calculations */
  numericResults: z.record(z.string(), z.any()),
  /** Statistical assumptions evaluated during computation */
  assumptions: z.array(StatisticalAssumptionSchema).default([]),
  /** Critical data warnings, sparsity cautions, or assumption violation notices */
  warnings: z.array(z.string()).default([]),
  /** Execution and dataset provenance */
  provenance: PythonProvenanceSchema,
  /** Sanitized error description if execution failed */
  error: z.string().optional(),
});
export type PythonAnalysisResult = z.infer<typeof PythonAnalysisResultSchema>;
