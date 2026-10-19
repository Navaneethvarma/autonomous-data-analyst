import { describe, it, expect } from 'vitest';
import { runAutomatedEdaTool } from '../../src/mastra/tools/run-automated-eda-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import { EdaAndInsightsResultSchema } from '../../src/lib/analytics/eda-types.js';

describe('Milestone 5 Automated EDA Mastra Tool & Agent Integration', () => {
  it('is registered on the dataAnalystAgent', async () => {
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('runAutomatedEdaTool');
    expect(agentTools.runAutomatedEdaTool).toBeDefined();
  });

  it('is retrievable via mastra.getTool()', () => {
    const tool = mastra.getTool('runAutomatedEdaTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe('run-automated-eda-tool');
  });

  it('executes automated EDA over sample_sales.csv and returns structured valid contract', async () => {
    const result = await runAutomatedEdaTool.execute!(
      {
        datasetPath: 'sample_sales.csv',
        includeCorrelations: true,
      },
      {} as any
    );

    expect(result).toBeDefined();
    expect(() => EdaAndInsightsResultSchema.parse(result)).not.toThrow();

    if (result && 'eda' in result) {
      expect(result.version).toBe('1.0.0');
      expect(result.dataset).toBe('sample_sales.csv');
      expect(result.eda.rowCount).toBe(10);
      expect(result.eda.columnCount).toBe(8);
      expect(result.eda.numericDistributions.length).toBeGreaterThan(0);
      expect(result.eda.categoricalDistributions.length).toBeGreaterThan(0);
      expect(result.eda.temporalAnalyses.length).toBeGreaterThan(0);
      expect(result.insights.length).toBeGreaterThan(0);

      // Verify that every insight has fact, hypothesis, and recommendation
      for (const ins of result.insights) {
        expect(ins.observedFact).toBeTruthy();
        expect(ins.hypothesis).toBeTruthy();
        expect(ins.recommendation).toBeTruthy();
      }
    }
  });

  it('blocks path traversal attacks safely', async () => {
    await expect(
      runAutomatedEdaTool.execute!(
        {
          datasetPath: '../../../etc/passwd',
        },
        {} as any
      )
    ).rejects.toThrow(/Access denied: path traverses outside the authorized dataset directory/);
  });
});
