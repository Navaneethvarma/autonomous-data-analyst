import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  analyticalWorkflow,
  ANALYTICAL_WORKFLOW_ID,
  executeAnalysisStep,
  runAnalyticalWorkflow,
} from '../../src/mastra/workflows/analytical-workflow.js';
import { mastra } from '../../src/mastra/index.js';
import { WorkflowResultSchema } from '../../src/lib/workflow/types.js';

describe('Mastra Workflow Registration & Execution (Milestone 10)', () => {
  const sampleSalesPath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  it('registers the analytical workflow in the Mastra container', () => {
    expect(analyticalWorkflow.id).toBe(ANALYTICAL_WORKFLOW_ID);
    expect(executeAnalysisStep.id).toBe('execute-analysis-pipeline');

    const registered = mastra.getWorkflow(ANALYTICAL_WORKFLOW_ID);
    expect(registered).toBeDefined();
    expect(registered?.id).toBe(ANALYTICAL_WORKFLOW_ID);
  });

  it('executes the analytical workflow directly via runAnalyticalWorkflow helper', async () => {
    const result = await runAnalyticalWorkflow({
      userQuery: 'What is our gross revenue across product categories?',
      datasetPath: sampleSalesPath,
      executionEngine: 'duckdb',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.workflowId).toBe('analytical-workflow');
    expect(result.executionResult?.rowCount).toBeGreaterThan(0);
    expect(result.validationResult?.isValid).toBe(true);

    const parsed = WorkflowResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
