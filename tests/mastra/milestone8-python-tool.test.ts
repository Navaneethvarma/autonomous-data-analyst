import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  runPythonAnalysisTool,
  RUN_PYTHON_ANALYSIS_TOOL_ID,
} from '../../src/mastra/tools/run-python-analysis-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import { runAutomatedEda } from '../../src/lib/analytics/eda-engine.js';
import { generateBusinessInsights } from '../../src/lib/analytics/insight-generator.js';

describe('Mastra Python Analytics Tool & Strategic Insight Differentiation (M8)', () => {
  it('registers run-python-analysis-tool with correct ID and description', () => {
    expect(runPythonAnalysisTool.id).toBe(RUN_PYTHON_ANALYSIS_TOOL_ID);
    expect(runPythonAnalysisTool.description).toContain('descriptive_stats');
    expect(runPythonAnalysisTool.description).toContain('group_comparison');
    expect(runPythonAnalysisTool.description).toContain('regression');
  });

  it('verifies run-python-analysis-tool is registered in Mastra and dataAnalystAgent', async () => {
    const tool = mastra.getTool('runPythonAnalysisTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe(RUN_PYTHON_ANALYSIS_TOOL_ID);

    // Verify agent tools
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('runPythonAnalysisTool');
    expect(agentTools.runPythonAnalysisTool).toBeDefined();
  });

  it('executes descriptive distribution analysis via tool interface', async () => {
    const datasetPath = path.resolve(process.cwd(), 'datasets/sample_sales.csv');
    const rawResult = await runPythonAnalysisTool.execute!(
      {
        taskId: 'tool-test-1',
        taskType: 'descriptive_stats',
        datasetId: 'sample_sales',
        datasetPath,
        columns: ['unit_price', 'quantity'],
        parameters: { column: 'unit_price' },
        limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 1000 },
      },
      {} as any
    );

    const result = rawResult as any;
    expect(result.status).toBe('success');
    expect(result.taskType).toBe('descriptive_stats');
    expect(result.numericResults.mean).toBeDefined();
    expect(result.provenance.datasetId).toBe('sample_sales');
  });

  it('executes Welch t-test comparison via tool interface', async () => {
    const datasetPath = path.resolve(process.cwd(), 'datasets/sample_sales.csv');
    const rawResult = await runPythonAnalysisTool.execute!(
      {
        taskId: 'tool-test-2',
        taskType: 'group_comparison',
        datasetId: 'sample_sales',
        datasetPath,
        columns: ['unit_price', 'discount_applied'],
        parameters: {
          metricColumn: 'unit_price',
          groupColumn: 'discount_applied',
        },
        limits: { timeoutMs: 10000, maxOutputBytes: 524288, maxRows: 1000 },
      },
      {} as any
    );

    const result = rawResult as any;
    expect(result.status).toBe('success');
    expect(result.numericResults.tStatistic).toBeDefined();
    expect(result.numericResults.pValue).toBeDefined();
    expect(result.numericResults.cohensD).toBeDefined();
  });

  it('distinguishes descriptive operational flags (payment_status, discount_applied) from strategic concentration insights', async () => {
    const datasetPath = path.resolve(process.cwd(), 'datasets/sample_sales.csv');
    const eda = await runAutomatedEda({
      datasetPath,
    });

    const insights = generateBusinessInsights(eda);

    // Look for insight on payment_status or discount_applied
    const statusInsight = insights.find(
      (i) =>
        i.affectedColumns.includes('payment_status') ||
        i.affectedColumns.includes('discount_applied')
    );

    if (statusInsight) {
      // Must NOT be classified as high-importance revenue concentration
      expect(statusInsight.importance).toBe('low');
      expect(statusInsight.category).toBe('category_distribution');
      expect(statusInsight.title).toContain('Operational Frequency');
      expect(statusInsight.recommendation).toMatch(/descriptive baseline/i);
    }

    // Look for commercial category insight (product_category)
    const productInsight = insights.find((i) =>
      i.affectedColumns.includes('product_category')
    );
    if (productInsight) {
      // Commercial segments retain strategic classification
      expect(productInsight.category).toBe('revenue_concentration');
    }
  });
});
