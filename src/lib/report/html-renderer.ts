import type { ReportSpec } from './types.js';
import { escapeHtml } from './svg-charts.js';
import { getReportStyles } from './report-styles.js';
import {
  renderHeaderSection,
  renderExecutiveSummarySection,
  renderKpisSection,
  renderQualitySection,
  renderFindingsSection,
  renderVisualizationsSection,
  renderTabularSection,
  renderStatisticalSection,
  renderMethodologySection,
  renderFooterSection,
} from './report-sections.js';

export { escapeHtml };

/**
 * Renders complete, print-styled, accessible HTML for an executive report.
 */
export function renderReportHtml(report: ReportSpec): string {
  const {
    metadata,
    executiveSummary,
    kpis,
    qualityAssessment,
    findings,
    charts,
    tables,
    statisticalAnalysis,
    methodology,
    appendix,
  } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(metadata.title)}</title>
  <style>
${getReportStyles()}
  </style>
</head>
<body>
  <div class="report-container">
    ${renderHeaderSection(metadata)}
    ${renderExecutiveSummarySection(executiveSummary)}
    ${renderKpisSection(kpis)}
    ${renderQualitySection(qualityAssessment)}
    ${renderFindingsSection(findings)}
    <div class="page-break-after"></div>
    ${renderVisualizationsSection(charts)}
    ${renderTabularSection(tables)}
    ${renderStatisticalSection(statisticalAnalysis)}
    ${renderMethodologySection(methodology, appendix)}
    ${renderFooterSection(metadata)}
  </div>
</body>
</html>`;
}
