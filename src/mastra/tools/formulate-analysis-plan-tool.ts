import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  formulateAnalysisPlan,
  type AnalysisPlan,
} from '../../lib/dataset/plan.js';

export const FORMULATE_ANALYSIS_PLAN_TOOL_ID = 'formulate-analysis-plan-tool';

export const MetricDefinitionSchema = z.object({
  name: z.string().min(1, 'Metric name is required'),
  description: z.string().min(1, 'Metric description is required'),
  formulaOrAggregation: z.string().optional(),
  unit: z.string().optional(),
});

export const formulateAnalysisPlanInputSchema = z.object({
  datasetPath: z.string().min(1, 'Dataset path is required'),
  businessQuestion: z.string().min(3, 'Business question must be at least 3 characters'),
  primaryObjective: z.string().min(3, 'Primary analytical objective must be specified'),
  requiredColumns: z.array(z.string()).min(1, 'At least one required column must be specified'),
  targetMetrics: z.array(MetricDefinitionSchema).min(1, 'At least one target metric must be specified'),
  filters: z.array(z.string()).optional(),
  groupingDimensions: z.array(z.string()).optional(),
  plannedSteps: z.array(z.string()).min(1, 'Planned execution steps must be provided'),
  assumptions: z.array(z.string()).optional(),
  unresolvedAmbiguities: z.array(z.string()).optional(),
});

export const formulateAnalysisPlanOutputSchema = z.object({
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

/**
 * Mastra Tool to convert a business analytical question into a validated, structured plan contract.
 * Checks required columns against the actual dataset schema and records explicit assumptions.
 */
export const formulateAnalysisPlanTool = createTool({
  id: FORMULATE_ANALYSIS_PLAN_TOOL_ID,
  description:
    'Formulates a structured analytical contract for answering a business question. ' +
    'Validates that required columns and grouping dimensions exist in the target dataset schema, ' +
    'specifies target metrics with formulas/units, and records explicit assumptions and unresolved ambiguities. ' +
    'Marks the plan as pending execution without claiming computations have run.',
  inputSchema: formulateAnalysisPlanInputSchema,
  outputSchema: formulateAnalysisPlanOutputSchema,
  execute: async (inputData): Promise<AnalysisPlan> => {
    return await formulateAnalysisPlan(inputData);
  },
});
