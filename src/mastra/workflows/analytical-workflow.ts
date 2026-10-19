import { createStep, Workflow } from '@mastra/core/workflows';
import {
  WorkflowRequestSchema,
  WorkflowResultSchema,
  type WorkflowRequest,
  type WorkflowResult,
} from '../../lib/workflow/types.js';
import { defaultWorkflowOrchestrator } from '../../lib/workflow/orchestrator.js';

export const ANALYTICAL_WORKFLOW_ID = 'analytical-workflow';

/**
 * Mastra Step executing the end-to-end analytical pipeline.
 */
export const executeAnalysisStep = createStep({
  id: 'execute-analysis-pipeline',
  description:
    'Coordinates dataset schema inspection, semantic metric resolution, analytical planning, ' +
    'safe DuckDB/Python execution, evidence validation, insight generation, and optional report export.',
  inputSchema: WorkflowRequestSchema,
  outputSchema: WorkflowResultSchema,
  execute: async ({ inputData }): Promise<WorkflowResult> => {
    return defaultWorkflowOrchestrator.executeWorkflow(inputData);
  },
});

/**
 * Versioned, typed Mastra Workflow instance for the Autonomous Data Analyst.
 */
export const analyticalWorkflow = new Workflow({
  id: ANALYTICAL_WORKFLOW_ID,
  description:
    'Autonomous Data Analyst Workflow orchestrating dataset inspection, business metric resolution, ' +
    'planning, execution, evidence validation, insight generation, and observable artifact reporting.',
  inputSchema: WorkflowRequestSchema,
  outputSchema: WorkflowResultSchema,
})
  .then(executeAnalysisStep)
  .commit();

/**
 * Convenience helper to run the workflow directly.
 */
export async function runAnalyticalWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  return defaultWorkflowOrchestrator.executeWorkflow(request);
}
