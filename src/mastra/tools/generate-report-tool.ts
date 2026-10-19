import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { validateAndResolveDatasetPath } from '../../lib/dataset/validator.js';
import { ReportSpecSchema } from '../../lib/report/types.js';
import { generateReportSpec } from '../../lib/report/generator.js';
import { renderReportHtml } from '../../lib/report/html-renderer.js';
import { exportPdfFromHtml } from '../../lib/report/pdf-generator.js';

export const GENERATE_REPORT_TOOL_ID = 'generate-report-tool';

export const GenerateReportInputSchema = z.object({
  datasetPath: z.string().min(1, 'Dataset file path is required'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  outputFormat: z.enum(['html', 'pdf', 'both']).optional(),
  outputDirectory: z.string().optional(),
  temporalDateColumn: z.string().optional(),
  temporalMetricColumn: z.string().optional(),
});

export type GenerateReportInput = z.infer<typeof GenerateReportInputSchema>;

export const GenerateReportOutputSchema = z.object({
  success: z.boolean(),
  reportSpec: ReportSpecSchema,
  htmlPath: z.string().optional(),
  pdfPath: z.string().optional(),
  pdfWarning: z.string().optional(),
  summary: z.string(),
});

export type GenerateReportOutput = z.infer<typeof GenerateReportOutputSchema>;

/**
 * Mastra Tool to generate an executive business report with HTML and PDF exports.
 */
export const generateReportTool = createTool({
  id: GENERATE_REPORT_TOOL_ID,
  description:
    'Generates an executive, evidence-backed business report (HTML & PDF) from an authorized dataset. ' +
    'Reuses computed DuckDB and EDA analytics to assemble an executive summary, KPI scorecard, ' +
    'data quality assessment, ranked findings (separating observed facts, hypotheses, and recommendations), ' +
    'print-styled vector charts, tabular summaries, statistical correlation/outlier sections with causation caveats, ' +
    'and methodology documentation.',
  inputSchema: GenerateReportInputSchema,
  outputSchema: GenerateReportOutputSchema,
  execute: async (inputData): Promise<GenerateReportOutput> => {
    const parsed = GenerateReportInputSchema.parse(inputData);
    const { resolvedPath } = validateAndResolveDatasetPath(parsed.datasetPath);

    // 1. Generate verified ReportSpec
    const reportSpec = await generateReportSpec(resolvedPath, {
      title: parsed.title,
      subtitle: parsed.subtitle,
      temporalDateColumn: parsed.temporalDateColumn,
      temporalMetricColumn: parsed.temporalMetricColumn,
    });

    // 2. Render Semantic HTML
    const htmlContent = renderReportHtml(reportSpec);

    // 3. Prepare output paths
    const outputDir = path.resolve(process.cwd(), parsed.outputDirectory || 'reports');
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    const baseName = path.basename(parsed.datasetPath, path.extname(parsed.datasetPath));
    const timestamp = Date.now();
    const htmlFilename = `${baseName}-executive-report-${timestamp}.html`;
    const pdfFilename = `${baseName}-executive-report-${timestamp}.pdf`;

    let htmlPath: string | undefined = undefined;
    let pdfPath: string | undefined = undefined;
    let pdfWarning: string | undefined = undefined;

    const requestedFormat = parsed.outputFormat || 'both';

    // Save HTML if requested
    if (requestedFormat === 'html' || requestedFormat === 'both') {
      htmlPath = path.join(outputDir, htmlFilename);
      await fs.promises.writeFile(htmlPath, htmlContent, 'utf-8');
    }

    // Export PDF if requested
    if (requestedFormat === 'pdf' || requestedFormat === 'both') {
      const targetPdfPath = path.join(outputDir, pdfFilename);
      try {
        await exportPdfFromHtml(htmlContent, targetPdfPath);
        pdfPath = targetPdfPath;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        pdfWarning = `PDF generation failed or runtime browser not available: ${errorMsg}`;
      }
    }

    const summary = `Generated Executive Report '${reportSpec.metadata.title}' for ${reportSpec.metadata.datasetName} ` +
      `(${reportSpec.metadata.datasetRowCount.toLocaleString()} rows). ` +
      `Included ${reportSpec.kpis.length} KPIs, ${reportSpec.findings.length} findings, ${reportSpec.charts.length} charts, and ` +
      `data quality completeness score of ${reportSpec.qualityAssessment.overallScore.toFixed(1)}%.` +
      (htmlPath ? ` HTML export saved to: ${htmlPath}.` : '') +
      (pdfPath ? ` PDF export saved to: ${pdfPath}.` : '') +
      (pdfWarning ? ` [Warning: ${pdfWarning}]` : '');

    return {
      success: true,
      reportSpec,
      htmlPath,
      pdfPath,
      pdfWarning,
      summary,
    };
  },
});
