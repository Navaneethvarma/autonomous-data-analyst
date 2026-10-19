import { z } from 'zod';

export const TraceStatusSchema = z.enum([
  'started',
  'completed',
  'retrying',
  'failed',
  'skipped',
  'warning',
]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const FailureCategorySchema = z.enum([
  'none',
  'transient_timeout',
  'transient_io',
  'syntax_or_safety_violation',
  'schema_incompatible',
  'unresolved_ambiguity',
  'unapproved_concept',
  'validation_rejected',
  'artifact_generation_error',
  'internal_error',
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const TraceSpanSchema = z.object({
  spanId: z.string().min(1),
  traceId: z.string().min(1),
  runId: z.string().min(1),
  stageName: z.string().min(1),
  status: TraceStatusSchema,
  startTime: z.string(),
  endTime: z.string().optional(),
  durationMs: z.number().optional(),
  retryCount: z.number().default(0),
  failureCategory: FailureCategorySchema.default('none'),
  toolName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  redactedErrors: z.array(z.string()).default([]),
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const WorkflowTraceSchema = z.object({
  traceId: z.string().min(1),
  runId: z.string().min(1),
  workflowId: z.string().min(1),
  datasetPath: z.string().optional(),
  schemaFingerprint: z.string().optional(),
  userQuery: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  totalDurationMs: z.number().optional(),
  finalStatus: z.enum([
    'completed',
    'partial_success',
    'ambiguity_clarification_needed',
    'validation_failed',
    'unresolved_exploratory',
    'failed',
  ]),
  spans: z.array(TraceSpanSchema),
  tokenUsage: z
    .object({
      promptTokens: z.number().default(0),
      completionTokens: z.number().default(0),
      totalTokens: z.number().default(0),
    })
    .optional(),
  modelLatencyMs: z.number().optional(),
  summary: z.string().optional(),
});
export type WorkflowTrace = z.infer<typeof WorkflowTraceSchema>;
