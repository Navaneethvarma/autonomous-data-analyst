import { describe, it, expect } from 'vitest';
import { generateDashboardSpecTool } from '../../src/mastra/tools/generate-dashboard-spec-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import { DashboardSpecSchema } from '../../src/lib/dashboard/types.js';

describe('Milestone 6 Dashboard Mastra Tool & Agent Integration', () => {
  it('is registered on the dataAnalystAgent', async () => {
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('generateDashboardSpecTool');
    expect(agentTools.generateDashboardSpecTool).toBeDefined();
  });

  it('is retrievable via mastra.getTool()', () => {
    const tool = mastra.getTool('generateDashboardSpecTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe('generate-dashboard-spec-tool');
  });

  it('executes generateDashboardSpecTool over sample_sales.csv and returns structured valid contract', async () => {
    const result = await generateDashboardSpecTool.execute!(
      {
        datasetPath: 'sample_sales.csv',
        title: 'Executive Sales Performance',
      },
      {} as any
    );

    expect(result).toBeDefined();
    expect(() => DashboardSpecSchema.parse(result)).not.toThrow();

    if (result && 'metadata' in result) {
      expect(result.version).toBe('1.0.0');
      expect(result.metadata.datasetName).toBe('sample_sales.csv');
      expect(result.metadata.datasetRowCount).toBe(10);
      expect(result.kpis.length).toBeGreaterThan(0);
      expect(result.charts.length).toBeGreaterThan(0);
      expect(result.table.rows.length).toBe(10);
      expect(result.insights.length).toBeGreaterThan(0);

      // Verify causation caveat on correlation matrix if present
      if (result.correlationMatrix) {
        expect(result.correlationMatrix.causationWarning).toContain('does NOT demonstrate, establish, or imply causal influence');
      }
    }
  });

  it('blocks path traversal attacks safely', async () => {
    await expect(
      generateDashboardSpecTool.execute!(
        {
          datasetPath: '../../../../etc/shadow',
        },
        {} as any
      )
    ).rejects.toThrow(/Access denied: path traverses outside the authorized dataset directory/);
  });
});
