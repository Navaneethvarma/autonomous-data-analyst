import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  MetricResolutionResultSchema,
  type MetricResolutionResult,
  ContextScopeSchema,
} from '../../lib/semantic/types.js';
import { defaultMetricResolver } from '../../lib/semantic/resolver.js';
import { profileDataset } from '../../lib/dataset/profiler.js';

export const RESOLVE_BUSINESS_METRIC_TOOL_ID = 'resolve-business-metric-tool';

export const resolveBusinessMetricInputSchema = z.object({
  userQuery: z
    .string()
    .min(1, 'User business query or metric question is required'),
  datasetPath: z
    .string()
    .min(1, 'Path to dataset file is required to inspect available columns'),
  scope: ContextScopeSchema.optional(),
  dimensionColumns: z.array(z.string()).optional(),
  filterExpressions: z.array(z.string()).optional(),
});

/**
 * Mastra Tool to resolve natural-language business questions against authoritative metric definitions.
 */
export const resolveBusinessMetricTool = createTool({
  id: RESOLVE_BUSINESS_METRIC_TOOL_ID,
  description:
    'Resolves a business question or metric name against the versioned corporate semantic layer and glossary. ' +
    'Inspects dataset schema to verify required source columns and compatible data types. ' +
    'Enforces metric additivity rules (e.g. preventing summing ratios or averages across categories), ' +
    'detects ambiguity (e.g. Gross vs Net Revenue), and generates validated SQL expressions grounded in accounting policy.',
  inputSchema: resolveBusinessMetricInputSchema,
  outputSchema: MetricResolutionResultSchema,
  execute: async (inputData): Promise<MetricResolutionResult> => {
    // Inspect dataset to extract actual available column names and inferred types
    const profile = await profileDataset(inputData.datasetPath);
    const datasetColumns = profile.columns.map((c) => ({
      name: c.name,
      inferredType: c.inferredType,
    }));

    return defaultMetricResolver.resolveMetric({
      userQuery: inputData.userQuery,
      datasetColumns,
      scope: inputData.scope ?? { level: 'application_wide' },
      dimensionColumns: inputData.dimensionColumns,
      filterExpressions: inputData.filterExpressions,
    });
  },
});
