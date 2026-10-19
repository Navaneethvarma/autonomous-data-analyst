import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inspectDatasetTool } from '../../src/mastra/tools/inspect-dataset-tool.js';
import { previewDatasetTool } from '../../src/mastra/tools/preview-dataset-tool.js';
import { formulateAnalysisPlanTool } from '../../src/mastra/tools/formulate-analysis-plan-tool.js';
import { validateAnalysisResultTool } from '../../src/mastra/tools/validate-analysis-result-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import { datasetProfileCache } from '../../src/lib/dataset/cache.js';

describe('Milestone 3 Mastra Tools Integration', () => {
  const datasetsDir = path.resolve(process.cwd(), 'datasets');
  const testFile = path.join(datasetsDir, 'm3_test_data.csv');

  beforeAll(() => {
    fs.mkdirSync(datasetsDir, { recursive: true });
    const content = [
      'product,units,price',
      'Laptop,5,1200',
      'Phone,10,800',
      'Tablet,8,450',
    ].join('\n');
    fs.writeFileSync(testFile, content);
    datasetProfileCache.clear();
  });

  afterAll(async () => {
    datasetProfileCache.clear();
    await new Promise((r) => setTimeout(r, 100));
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch {
        // Windows file handle release delay
      }
    }
  });

  it('executes inspectDatasetTool with caching', async () => {
    const firstCall = await inspectDatasetTool.execute!(
      { filePath: 'm3_test_data.csv' },
      {} as any
    );

    expect(firstCall).toBeDefined();
    if (firstCall && 'columns' in firstCall) {
      expect(firstCall.fileName).toBe('m3_test_data.csv');
      expect(firstCall.columnCount).toBe(3);
      expect(firstCall.rowCount).toBe(3);
      expect(firstCall.cached).toBe(false);
    }

    // Second call should return cached: true
    const secondCall = await inspectDatasetTool.execute!(
      { filePath: 'm3_test_data.csv' },
      {} as any
    );
    expect(secondCall).toBeDefined();
    if (secondCall && 'cached' in secondCall) {
      expect(secondCall.cached).toBe(true);
    }
  });

  it('executes previewDatasetTool with bounded rows and column projection', async () => {
    const preview = await previewDatasetTool.execute!(
      {
        filePath: 'm3_test_data.csv',
        mode: 'head',
        limit: 2,
        columns: ['product', 'price'],
      },
      {} as any
    );

    expect(preview).toBeDefined();
    if (preview && 'rows' in preview) {
      expect(preview.previewCount).toBe(2);
      expect(preview.columns).toEqual(['product', 'price']);
      expect(preview.rows[0]).toEqual({ product: 'Laptop', price: '1200' });
      expect(preview.rows[0]?.['units']).toBeUndefined();
    }
  });

  it('executes formulateAnalysisPlanTool and grounds required columns', async () => {
    const plan = await formulateAnalysisPlanTool.execute!(
      {
        datasetPath: 'm3_test_data.csv',
        businessQuestion: 'What is total inventory value?',
        primaryObjective: 'Calculate total units and total inventory value',
        requiredColumns: ['product', 'units', 'price'],
        targetMetrics: [
          {
            name: 'total_inventory_value',
            description: 'Sum of units * price',
            formulaOrAggregation: 'SUM(units * price)',
            unit: 'USD',
          },
        ],
        plannedSteps: ['Multiply units by price for each product', 'Sum the values'],
        assumptions: ['Units and price are positive integers'],
      },
      {} as any
    );

    expect(plan).toBeDefined();
    if (plan && 'planId' in plan) {
      expect(plan.planId).toMatch(/^plan_/);
      expect(plan.status).toBe('draft_plan_pending_execution');
      expect(plan.requiredColumns).toEqual(['product', 'units', 'price']);
      expect(plan.targetMetrics[0]?.name).toBe('total_inventory_value');
    }
  });

  it('executes validateAnalysisResultTool with domain constraints', async () => {
    const result = await validateAnalysisResultTool.execute!(
      {
        metricName: 'total_units',
        metricValue: 23,
        rule: {
          type: 'non_negative',
          metricContext: 'Inventory units count',
        },
      },
      {} as any
    );

    expect(result).toBeDefined();
    if (result && 'isValid' in result) {
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('valid');
    }

    const invalidResult = await validateAnalysisResultTool.execute!(
      {
        metricName: 'discount_rate',
        metricValue: 125,
        rule: {
          type: 'percentage_bounded',
          min: 0,
          max: 100,
        },
      },
      {} as any
    );

    expect(invalidResult).toBeDefined();
    if (invalidResult && 'isValid' in invalidResult) {
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.status).toBe('invalid');
    }
  });

  it('registers all Milestone 3 tools on dataAnalystAgent', async () => {
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toBeDefined();

    const expectedToolKeys = [
      'profileDatasetTool',
      'inspectDatasetTool',
      'previewDatasetTool',
      'formulateAnalysisPlanTool',
      'validateAnalysisResultTool',
    ];

    for (const key of expectedToolKeys) {
      expect(agentTools[key]).toBeDefined();
    }
  });

  it('registers all Milestone 3 tools on the central Mastra application instance', () => {
    const expectedToolKeys = [
      'profileDatasetTool',
      'inspectDatasetTool',
      'previewDatasetTool',
      'formulateAnalysisPlanTool',
      'validateAnalysisResultTool',
    ] as const;

    for (const key of expectedToolKeys) {
      const tool = mastra.getTool(key);
      expect(tool).toBeDefined();
    }
  });
});
