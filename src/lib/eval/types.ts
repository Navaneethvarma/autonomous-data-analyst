import { z } from 'zod';

export const EvaluationCategorySchema = z.enum([
  'numeric_accuracy',
  'metric_resolution',
  'schema_compatibility',
  'python_statistics',
  'evidence_traceability',
  'causation_restraint',
  'small_sample_communication',
  'security_prompt_injection',
  'security_unsafe_sql',
  'missing_values_and_empty_data',
  'artifact_generation',
  'failure_handling_and_recovery',
]);
export type EvaluationCategory = z.infer<typeof EvaluationCategorySchema>;

export const EvaluationCaseResultSchema = z.object({
  caseId: z.string(),
  name: z.string(),
  category: EvaluationCategorySchema,
  status: z.enum(['passed', 'failed']),
  score: z.number().min(0).max(1),
  assertionsPassed: z.number(),
  totalAssertions: z.number(),
  durationMs: z.number(),
  details: z.array(z.string()),
  limitations: z.array(z.string()).default([]),
});
export type EvaluationCaseResult = z.infer<typeof EvaluationCaseResultSchema>;

export const EvaluationSummaryMetricsSchema = z.object({
  numericalCorrectnessRate: z.number(),
  evidenceCoverageRate: z.number(),
  metricResolutionAccuracy: z.number(),
  unsupportedClaimRate: z.number(),
  toolFailureRate: z.number(),
  taskCompletionRate: z.number(),
  denominators: z.record(z.string(), z.string()).optional(),
});
export type EvaluationSummaryMetrics = z.infer<typeof EvaluationSummaryMetricsSchema>;

export const EvaluationReportSchema = z.object({
  contractVersion: z.literal('1.0.0').default('1.0.0'),
  timestamp: z.string(),
  executionDurationMs: z.number(),
  summary: z.object({
    totalCases: z.number(),
    passedCases: z.number(),
    failedCases: z.number(),
    overallPassRate: z.number(),
  }),
  coveredCategories: z.array(EvaluationCategorySchema).optional(),
  metrics: EvaluationSummaryMetricsSchema,
  results: z.array(EvaluationCaseResultSchema),
  methodologyNotes: z.array(z.string()),
  disclaimersAndLimitations: z.array(z.string()),
});
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;
