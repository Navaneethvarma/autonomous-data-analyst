import { profileDataset } from './profiler.js';

export class InvalidPlanColumnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPlanColumnError';
  }
}

export interface MetricDefinition {
  name: string;
  description: string;
  formulaOrAggregation?: string;
  unit?: string;
}

export interface AnalysisPlanInput {
  datasetPath: string;
  businessQuestion: string;
  primaryObjective: string;
  requiredColumns: string[];
  targetMetrics: MetricDefinition[];
  filters?: string[];
  groupingDimensions?: string[];
  plannedSteps: string[];
  assumptions?: string[];
  unresolvedAmbiguities?: string[];
  customBaseDir?: string;
}

export interface AnalysisPlan {
  planId: string;
  datasetPath: string;
  businessQuestion: string;
  primaryObjective: string;
  requiredColumns: string[];
  targetMetrics: MetricDefinition[];
  filters: string[];
  groupingDimensions: string[];
  plannedSteps: string[];
  assumptions: string[];
  unresolvedAmbiguities: string[];
  status: 'draft_plan_pending_execution';
  createdAt: string;
}

/**
 * Creates and validates an analytical plan contract grounded against the actual dataset schema.
 * Rejects non-existent columns and explicitly marks the plan as pending execution.
 */
export async function formulateAnalysisPlan(
  input: AnalysisPlanInput
): Promise<AnalysisPlan> {
  // Obtain dataset profile to validate columns against actual schema
  const profile = await profileDataset(input.datasetPath, {
    customBaseDir: input.customBaseDir,
  });

  const availableColumns = new Set(profile.columns.map(c => c.name));

  // Check requiredColumns
  const invalidRequired = input.requiredColumns.filter(c => !availableColumns.has(c));
  if (invalidRequired.length > 0) {
    throw new InvalidPlanColumnError(
      `Required column(s) [${invalidRequired.map(c => `'${c}'`).join(', ')}] not found in dataset '${profile.fileName}'. ` +
      `Available columns: [${Array.from(availableColumns).map(c => `'${c}'`).join(', ')}]`
    );
  }

  // Check groupingDimensions
  const grouping = input.groupingDimensions ?? [];
  const invalidGrouping = grouping.filter(c => !availableColumns.has(c));
  if (invalidGrouping.length > 0) {
    throw new InvalidPlanColumnError(
      `Grouping dimension column(s) [${invalidGrouping.map(c => `'${c}'`).join(', ')}] not found in dataset '${profile.fileName}'. ` +
      `Available columns: [${Array.from(availableColumns).map(c => `'${c}'`).join(', ')}]`
    );
  }

  const planId = `plan_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    planId,
    datasetPath: profile.fileName,
    businessQuestion: input.businessQuestion.trim(),
    primaryObjective: input.primaryObjective.trim(),
    requiredColumns: input.requiredColumns,
    targetMetrics: input.targetMetrics,
    filters: input.filters ?? [],
    groupingDimensions: grouping,
    plannedSteps: input.plannedSteps,
    assumptions: input.assumptions ?? [],
    unresolvedAmbiguities: input.unresolvedAmbiguities ?? [],
    status: 'draft_plan_pending_execution',
    createdAt: new Date().toISOString(),
  };
}
