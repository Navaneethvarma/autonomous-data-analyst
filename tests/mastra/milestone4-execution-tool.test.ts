import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { executeAnalyticalQueryTool } from '../../src/mastra/tools/execute-analytical-query-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';

describe('Milestone 4 Analytical Execution Mastra Tool', () => {
  const datasetsDir = path.resolve(process.cwd(), 'datasets');
  const testFile = path.join(datasetsDir, 'm4_execution_test.csv');

  beforeAll(() => {
    fs.mkdirSync(datasetsDir, { recursive: true });
    const content = [
      'region,sales,reps',
      'North,15000,5',
      'South,22000,7',
      'East,18000,6',
      'West,31000,9',
    ].join('\n');
    fs.writeFileSync(testFile, content);
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch {
        // Windows file handle release delay
      }
    }
  });

  it('is registered on the dataAnalystAgent', async () => {
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('executeAnalyticalQueryTool');
    expect(agentTools.executeAnalyticalQueryTool).toBeDefined();
  });

  it('is retrievable via mastra.getTool()', () => {
    const tool = mastra.getTool('executeAnalyticalQueryTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe('execute-analytical-query-tool');
  });

  it('executes valid analytical SQL and returns structured result', async () => {
    const result = await executeAnalyticalQueryTool.execute!(
      {
        datasetPath: 'm4_execution_test.csv',
        sql: 'SELECT region, sales FROM dataset WHERE sales > 20000 ORDER BY sales DESC',
      },
      {} as any
    );

    expect(result).toBeDefined();
    if (result && 'rows' in result) {
      expect(result.rowCount).toBe(2);
      expect(result.columns).toEqual(['region', 'sales']);
      expect(result.rows[0]?.region).toBe('West');
      expect(result.rows[0]?.sales).toBe(31000);
      expect(result.isTruncated).toBe(false);
      expect(result.provenance.datasetFile).toBe('m4_execution_test.csv');
      expect(result.provenance.engine).toContain('DuckDB');
    }
  });

  it('supports aggregation with GROUP BY and SUM', async () => {
    const result = await executeAnalyticalQueryTool.execute!(
      {
        datasetPath: 'm4_execution_test.csv',
        sql: 'SELECT SUM(sales) as total_sales, AVG(reps) as avg_reps FROM dataset',
      },
      {} as any
    );

    expect(result).toBeDefined();
    if (result && 'rows' in result) {
      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.total_sales).toBe(86000);
      expect(result.rows[0]?.avg_reps).toBe(6.75);
    }
  });

  it('handles parameterized queries correctly', async () => {
    const result = await executeAnalyticalQueryTool.execute!(
      {
        datasetPath: 'm4_execution_test.csv',
        sql: 'SELECT region, reps FROM dataset WHERE reps >= ? ORDER BY reps ASC',
        parameters: [7],
      },
      {} as any
    );

    expect(result).toBeDefined();
    if (result && 'rows' in result) {
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]?.region).toBe('South');
      expect(result.rows[1]?.region).toBe('West');
    }
  });

  it('rejects forbidden SQL mutations with clean error', async () => {
    await expect(
      executeAnalyticalQueryTool.execute!(
        {
          datasetPath: 'm4_execution_test.csv',
          sql: 'DROP TABLE dataset;',
        },
        {} as any
      )
    ).rejects.toThrow(/Prohibited keyword or operation/);
  });
});
