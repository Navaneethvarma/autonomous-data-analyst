import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  validateAnalysisResult,
  type ValidationResult,
} from '../../lib/dataset/validation.js';

export const VALIDATE_ANALYSIS_RESULT_TOOL_ID = 'validate-analysis-result-tool';

export const ValidationRuleTypeSchema = z.enum([
  'non_negative',
  'percentage_bounded',
  'range_bounds',
  'reconciliation_sum',
  'not_null_or_empty',
  'custom_assertion',
]);

export const ValidationRuleInputSchema = z.object({
  type: ValidationRuleTypeSchema,
  metricContext: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  expectedSum: z.number().optional(),
  components: z.array(z.number()).optional(),
  tolerance: z.number().optional(),
  assertionDescription: z.string().optional(),
  assertionPassed: z.boolean().optional(),
});

export const validateAnalysisResultInputSchema = z.object({
  metricName: z.string().min(1, 'Metric name must be provided'),
  metricValue: z.unknown(),
  rule: ValidationRuleInputSchema,
  unit: z.string().optional(),
});

export const validateAnalysisResultOutputSchema = z.object({
  metricName: z.string(),
  status: z.enum(['valid', 'invalid', 'unverifiable']),
  isValid: z.boolean(),
  ruleApplied: z.string(),
  details: z.string(),
  toleranceUsed: z.number().optional(),
  verifiedAt: z.string(),
});

/**
 * Mastra Tool to validate calculated metrics against domain constraints and tolerances.
 * Reports 'unverifiable' if insufficient component data exists rather than falsely passing.
 */
export const validateAnalysisResultTool = createTool({
  id: VALIDATE_ANALYSIS_RESULT_TOOL_ID,
  description:
    'Validates an analytical computation result against explicit domain constraints (non-negativity, ' +
    'percentage boundaries, range bounds, component reconciliation sums, or business assertions). ' +
    'Returns status as valid, invalid, or unverifiable.',
  inputSchema: validateAnalysisResultInputSchema,
  outputSchema: validateAnalysisResultOutputSchema,
  execute: async (inputData): Promise<ValidationResult> => {
    return validateAnalysisResult({
      metricName: inputData.metricName,
      metricValue: inputData.metricValue,
      rule: inputData.rule,
      unit: inputData.unit,
    });
  },
});
