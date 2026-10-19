import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { generateReportTool } from '../../src/mastra/tools/generate-report-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import { GenerateReportOutputSchema } from '../../src/mastra/tools/generate-report-tool.js';

describe('Milestone 7 Report Mastra Tool & Agent Integration', () => {
  const generatedFiles: string[] = [];

  afterAll(async () => {
    for (const f of generatedFiles) {
      if (fs.existsSync(f)) {
        await fs.promises.unlink(f).catch(() => {});
      }
    }
  });

  it('is registered on the dataAnalystAgent', async () => {
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('generateReportTool');
    expect(agentTools.generateReportTool).toBeDefined();
  });

  it('is retrievable via mastra.getTool()', () => {
    const tool = mastra.getTool('generateReportTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe('generate-report-tool');
  });

  it('executes generateReportTool over sample_sales.csv producing valid HTML and PDF outputs', async () => {
    const result = await generateReportTool.execute!(
      {
        datasetPath: 'sample_sales.csv',
        title: 'Executive Sales Performance Report',
        temporalDateColumn: 'transaction_date',
        temporalMetricColumn: 'unit_price',
        outputDirectory: 'reports',
        outputFormat: 'both',
      },
      {} as any
    );

    expect(result).toBeDefined();
    expect(() => GenerateReportOutputSchema.parse(result)).not.toThrow();

    if (result && 'reportSpec' in result) {
      expect(result.success).toBe(true);
      expect(result.reportSpec.metadata.title).toBe('Executive Sales Performance Report');
      expect(result.reportSpec.metadata.datasetRowCount).toBe(10);
      expect(result.reportSpec.kpis.length).toBeGreaterThan(0);
      expect(result.reportSpec.findings.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Generated Executive Report');

      // Check HTML output
      expect(result.htmlPath).toBeDefined();
      if (result.htmlPath) {
        generatedFiles.push(result.htmlPath);
        expect(fs.existsSync(result.htmlPath)).toBe(true);
        const htmlStats = fs.statSync(result.htmlPath);
        expect(htmlStats.size).toBeGreaterThan(1000);
      }

      // Check PDF output (or warning if browser was absent)
      if (result.pdfPath) {
        generatedFiles.push(result.pdfPath);
        expect(fs.existsSync(result.pdfPath)).toBe(true);
        const pdfStats = fs.statSync(result.pdfPath);
        expect(pdfStats.size).toBeGreaterThan(5000);
      }
    }
  });

  it('blocks path traversal attacks safely', async () => {
    await expect(
      generateReportTool.execute!(
        {
          datasetPath: '../../../../etc/shadow',
        },
        {} as any
      )
    ).rejects.toThrow(/Access denied: path traverses outside the authorized dataset directory/);
  });
});
