import { z } from 'zod';
import {
  MetricResolutionResultSchema,
  ContextScopeSchema,
  ContextCitationSchema,
} from '../semantic/types.js';
import { WorkflowTraceSchema } from '../observability/types.js';

export const WorkflowStageNameSchema = z.enum([
  'inspection',
  'semantic_resolution',
  'planning',
  'execution',
  'validation',
  'insight_generation',
  'artifact_generation',
  'response_assembly',
]);
export type WorkflowStageName = z.infer<typeof WorkflowStageNameSchema>;

export const WorkflowStatusSchema = z.enum([
  'completed',
  'ambiguity_clarification_needed',
  'incompatible_schema',
  'unresolved_exploratory',
  'validation_failed',
  'partial_success_artifact_failed',
  'execution_error',
  'terminal_failure',
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowRequestSchema = z.object({
  userQuery: z.string().min(1, 'userQuery is required'),
  datasetPath: z.string().min(1, 'datasetPath is required'),
  scope: ContextScopeSchema.optional(),
  executionEngine: z.enum(['auto', 'duckdb', 'python']).optional(),
  generateArtifacts: z
    .object({
      dashboard: z.boolean().optional(),
      report: z.boolean().optional(),
      reportTitle: z.string().optional(),
    })
    .optional(),
  retryPolicy: z
    .object({
      maxRetries: z.number().int().min(0).max(3).optional(),
      timeoutMs: z.number().int().min(1000).max(60000).optional(),
    })
    .optional(),
});
export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

export const MetricDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  formulaOrAggregation: z.string().optional(),
  unit: z.string().optional(),
});

export const AnalysisPlanSchema = z.object({
  planId: z.string(),
  datasetPath: z.string(),
  businessQuestion: z.string(),
  primaryObjective: z.string(),
  requiredColumns: z.array(z.string()),
  targetMetrics: z.array(MetricDefinitionSchema),
  filters: z.array(z.string()),
  groupingDimensions: z.array(z.string()),
  plannedSteps: z.array(z.string()),
  assumptions: z.array(z.string()),
  unresolvedAmbiguities: z.array(z.string()),
  status: z.literal('draft_plan_pending_execution'),
  createdAt: z.string(),
});
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

export const WorkflowResultSchema = z.object({
  workflowId: z.string(),
  runId: z.string(),
  traceId: z.string(),
  status: WorkflowStatusSchema,
  userQuery: z.string(),
  datasetPath: z.string(),
  schemaFingerprint: z.string(),
  inspectionSummary: z
    .object({
      rowCount: z.number(),
      columnCount: z.number(),
      columns: z.array(z.object({ name: z.string(), inferredType: z.string() })),
      dataQualityScore: z.number(),
    })
    .nullable(),
  semanticResolution: MetricResolutionResultSchema.nullable(),
  retrievedCitations: z.array(ContextCitationSchema).default([]),
  analyticalPlan: AnalysisPlanSchema.nullable(),
  executionResult: z
    .object({
      engineUsed: z.enum(['duckdb', 'python', 'none']),
      sql: z.string().optional(),
      pythonTaskType: z.string().optional(),
      rows: z.array(z.record(z.string(), z.unknown())).optional(),
      rowCount: z.number().optional(),
      numericSummary: z.record(z.string(), z.unknown()).optional(),
      executionDurationMs: z.number(),
    })
    .nullable(),
  validationResult: z
    .object({
      isValid: z.boolean(),
      status: z.string(),
      ruleApplied: z.string(),
      details: z.string(),
    })
    .nullable(),
  insights: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['fact', 'hypothesis', 'recommendation']),
      title: z.string(),
      description: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    })
  ).default([]),
  generatedArtifacts: z
    .object({
      dashboardSpecGenerated: z.boolean().default(false),
      dashboardSpec: z.unknown().optional(),
      reportHtmlPath: z.string().optional(),
      reportPdfPath: z.string().optional(),
      artifactError: z.string().optional(),
    })
    .default({}),
  finalExplanation: z.string().nullable().default(null),
  clarificationQuestion: z.string().nullable().default(null),
  trace: WorkflowTraceSchema,
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
