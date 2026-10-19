import { ReportSpec, ReportChart } from './types.js';

/**
 * Escapes unsafe characters in untrusted strings to prevent HTML/script injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates vector SVG for charts so that PDF rendering is instantaneous, crisp, and requires zero external network calls.
 */
function renderSvgChart(chart: ReportChart): string {
  const width = 720;
  const height = 260;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (chart.data.length === 0) {
    return `<div class="chart-empty">No data available for chart rendering.</div>`;
  }

  const values = chart.data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  if (chart.chartType === 'line') {
    // Render SVG Line Chart
    const points = chart.data.map((d, i) => {
      const x = padding.left + (i / Math.max(chart.data.length - 1, 1)) * plotWidth;
      const y = padding.top + plotHeight - ((d.value - minVal) / range) * plotHeight;
      return { x, y, label: d.label, val: d.value };
    });

    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaData = firstPoint && lastPoint
      ? `${pathData} L ${lastPoint.x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} L ${firstPoint.x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`
      : '';

    const dots = points.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#1e293b">${escapeHtml(p.val >= 1000 ? (p.val / 1000).toFixed(1) + 'k' : p.val.toFixed(0))}</text>
      <text x="${p.x.toFixed(1)}" y="${(padding.top + plotHeight + 18).toFixed(1)}" text-anchor="middle" font-size="9" fill="#64748b">${escapeHtml(p.label)}</text>
    `).join('');

    return `
      <svg class="report-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Gridlines -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <line x1="${padding.left}" y1="${padding.top + plotHeight / 2}" x2="${width - padding.right}" y2="${padding.top + plotHeight / 2}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" stroke-width="1"/>
        <!-- Area fill -->
        <path d="${areaData}" fill="rgba(37, 99, 235, 0.08)"/>
        <!-- Trend line -->
        <path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>
    `;
  }

  // Render SVG Bar Chart (default)
  const barCount = chart.data.length;
  const barWidth = Math.max(Math.min((plotWidth / barCount) * 0.65, 48), 12);
  const gap = plotWidth / barCount;

  const bars = chart.data.map((d, i) => {
    const x = padding.left + i * gap + (gap - barWidth) / 2;
    const barHeight = Math.max(((d.value - minVal) / range) * plotHeight, 2);
    const y = padding.top + plotHeight - barHeight;
    const displayVal = d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : `${d.value}`;

    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="#3b82f6"/>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#1e293b">${escapeHtml(displayVal)}</text>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(padding.top + plotHeight + 16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#64748b">${escapeHtml(d.label)}</text>
    `;
  }).join('');

  return `
    <svg class="report-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Horizontal axis -->
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#f1f5f9" stroke-dasharray="3,3"/>
      <line x1="${padding.left}" y1="${padding.top + plotHeight / 2}" x2="${width - padding.right}" y2="${padding.top + plotHeight / 2}" stroke="#f1f5f9" stroke-dasharray="3,3"/>
      ${bars}
    </svg>
  `;
}

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
    /* ==========================================================================
       Print & Screen Base Design Tokens
       ========================================================================== */
    :root {
      --primary: #0f172a;
      --primary-accent: #2563eb;
      --secondary: #475569;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --bg-main: #ffffff;
      --bg-alt: #f8fafc;
      --bg-subtle: #f1f5f9;
      --border-light: #e2e8f0;
      --border-dark: #cbd5e1;
      --positive: #16a34a;
      --warning: #d97706;
      --negative: #dc2626;
      --neutral: #64748b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text-main);
      background-color: var(--bg-main);
      line-height: 1.5;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Page Setup */
    @page {
      size: A4;
      margin: 15mm 15mm 18mm 15mm;
      @bottom-right {
        content: "Page " counter(page);
        font-size: 9px;
        color: #94a3b8;
      }
    }

    @media screen {
      body {
        max-width: 900px;
        margin: 20px auto;
        padding: 30px;
        background: #f1f5f9;
      }
      .report-container {
        background: #ffffff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border-radius: 8px;
        padding: 40px;
      }
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .report-container {
        box-shadow: none;
        padding: 0;
      }
      .page-break-after {
        page-break-after: always;
        break-after: page;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }

    /* Typography */
    h1, h2, h3, h4 {
      color: var(--primary);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    h1 { font-size: 24px; line-height: 1.25; margin-bottom: 6px; }
    h2 { font-size: 16px; margin-bottom: 12px; border-bottom: 2px solid var(--border-light); padding-bottom: 4px; }
    h3 { font-size: 14px; margin-bottom: 6px; }
    h4 { font-size: 12px; }

    p { margin-bottom: 8px; }

    /* Section Styling */
    .section {
      margin-bottom: 28px;
    }

    /* Cover / Header */
    .report-header {
      padding-bottom: 18px;
      margin-bottom: 24px;
      border-bottom: 3px solid var(--primary-accent);
    }
    .report-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 14px;
      background: var(--bg-alt);
      padding: 12px 16px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
    }
    .meta-item .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }
    .meta-item .meta-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--primary);
      margin-top: 2px;
    }

    /* Executive Summary Box */
    .summary-card {
      background: #f8fafc;
      border-left: 4px solid var(--primary-accent);
      padding: 16px 20px;
      border-radius: 4px;
      margin-bottom: 18px;
    }
    .summary-headline {
      font-size: 14px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 8px;
    }
    .takeaway-list {
      padding-left: 18px;
      margin-bottom: 10px;
    }
    .takeaway-list li {
      margin-bottom: 4px;
      color: var(--text-main);
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-label {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
    }
    .kpi-val {
      font-size: 20px;
      font-weight: 800;
      color: var(--primary);
      margin: 4px 0;
    }
    .kpi-def {
      font-size: 10px;
      color: var(--secondary);
      line-height: 1.3;
    }
    .kpi-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-top: 4px;
      align-self: flex-start;
    }
    .badge-positive { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-negative { background: #fee2e2; color: #b91c1c; }
    .badge-neutral { background: #f1f5f9; color: #475569; }

    /* Key Findings */
    .finding-card {
      border: 1px solid var(--border-light);
      border-radius: 6px;
      margin-bottom: 14px;
      background: #ffffff;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .finding-header {
      background: var(--bg-alt);
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .finding-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
    }
    .finding-body {
      padding: 12px 14px;
    }
    .finding-segment {
      margin-bottom: 8px;
    }
    .segment-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .label-fact { color: #2563eb; }
    .label-hypo { color: #7c3aed; }
    .label-act { color: #16a34a; }

    /* Tables */
    .report-table-wrapper {
      margin-bottom: 18px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 6px;
    }
    .report-table th, .report-table td {
      padding: 6px 10px;
      border: 1px solid var(--border-light);
    }
    .report-table th {
      background: var(--bg-alt);
      color: var(--primary);
      font-weight: 700;
      text-align: left;
    }
    .report-table tr:nth-child(even) {
      background: #fafafa;
    }
    .table-caption {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
      font-style: italic;
    }

    /* Charts */
    .chart-container {
      margin-bottom: 20px;
      border: 1px solid var(--border-light);
      border-radius: 6px;
      padding: 14px;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .chart-header {
      margin-bottom: 8px;
    }
    .chart-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
    }
    .chart-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }
    .report-svg-chart {
      width: 100%;
      height: auto;
      max-height: 240px;
      display: block;
    }
    .chart-caption {
      font-size: 10px;
      color: var(--secondary);
      margin-top: 6px;
      line-height: 1.35;
      font-style: italic;
    }

    /* Quality Scorecard */
    .scorecard-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      background: var(--bg-alt);
      padding: 10px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
    }
    .scorecard-metric {
      font-size: 12px;
    }
    .scorecard-metric strong {
      color: var(--primary);
    }

    /* Non-causation Alert */
    .alert-causation {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 11px;
      color: #92400e;
      margin-bottom: 14px;
      line-height: 1.4;
    }

    /* Appendix & Methodology */
    .appendix-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .appendix-item {
      background: var(--bg-alt);
      border: 1px solid var(--border-light);
      padding: 8px 12px;
      border-radius: 4px;
    }
    .appendix-term {
      font-weight: 700;
      font-size: 12px;
      color: var(--primary);
    }
    .appendix-formula {
      font-family: monospace;
      font-size: 10px;
      color: var(--primary-accent);
      margin: 2px 0;
    }
    .appendix-desc {
      font-size: 11px;
      color: var(--secondary);
    }

    /* Footer */
    .report-footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="report-container">
    
    <!-- 1. Header & Metadata -->
    <header class="report-header">
      <h1>${escapeHtml(metadata.title)}</h1>
      ${metadata.subtitle ? `<p style="font-size: 13px; color: var(--secondary); margin-bottom: 6px;">${escapeHtml(metadata.subtitle)}</p>` : ''}
      
      <div class="report-meta-grid">
        <div class="meta-item">
          <div class="meta-label">Dataset</div>
          <div class="meta-value">${escapeHtml(metadata.datasetName)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Records / Scope</div>
          <div class="meta-value">${escapeHtml(metadata.datasetRowCount.toLocaleString())} rows (${escapeHtml(metadata.datasetColumnCount)} cols)</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Reporting Period</div>
          <div class="meta-value">${metadata.reportingPeriod ? `${escapeHtml(metadata.reportingPeriod.startDate)} to ${escapeHtml(metadata.reportingPeriod.endDate)}` : 'Full Dataset Profile'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Generated Date</div>
          <div class="meta-value">${escapeHtml(new Date(metadata.generatedAt).toLocaleDateString())}</div>
        </div>
      </div>
    </header>

    <!-- 2. Executive Summary -->
    <section class="section avoid-break">
      <h2>Executive Summary</h2>
      <div class="summary-card">
        <div class="summary-headline">${escapeHtml(executiveSummary.headline)}</div>
        <ul class="takeaway-list">
          ${executiveSummary.primaryTakeaways.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
          <strong>Data Trust Rating:</strong> ${escapeHtml(executiveSummary.dataTrustRating.toUpperCase())} &mdash; ${escapeHtml(executiveSummary.dataTrustSummary)}
        </div>
      </div>
    </section>

    <!-- 3. Key Performance Indicators -->
    <section class="section avoid-break">
      <h2>Executive Key Performance Indicators</h2>
      <div class="kpi-grid">
        ${kpis.map(k => `
          <div class="kpi-card">
            <div>
              <div class="kpi-label">${escapeHtml(k.name)}</div>
              <div class="kpi-val">${escapeHtml(k.formattedValue)}</div>
              ${k.changePercentage !== undefined && k.comparisonPeriod ? `
                <span class="kpi-badge badge-${escapeHtml(k.status)}">
                  ${k.changePercentage >= 0 ? '+' : ''}${k.changePercentage.toFixed(1)}% vs ${escapeHtml(k.comparisonPeriod)}
                </span>
              ` : ''}
            </div>
            <div class="kpi-def" style="margin-top: 6px;">${escapeHtml(k.definition)}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="page-break-after"></div>

    <!-- 4. Data Quality & Completeness Scorecard -->
    <section class="section">
      <h2>Data Quality &amp; Completeness Scorecard</h2>
      <div class="scorecard-summary">
        <div class="scorecard-metric">Overall Score: <strong>${escapeHtml(qualityAssessment.overallScore.toFixed(1))}%</strong></div>
        <div class="scorecard-metric">Status: <strong>${escapeHtml(qualityAssessment.status.toUpperCase())}</strong></div>
        <div class="scorecard-metric">Columns with Nulls: <strong>${escapeHtml(qualityAssessment.columnsWithNullsCount)} / ${escapeHtml(qualityAssessment.totalColumns)}</strong></div>
      </div>

      <div class="report-table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Data Type</th>
              <th style="text-align: right;">Completeness %</th>
              <th style="text-align: right;">Null Count</th>
              <th>Identified Issues</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${qualityAssessment.scorecard.map(item => `
              <tr>
                <td><strong>${escapeHtml(item.column)}</strong></td>
                <td>${escapeHtml(item.dataType)}</td>
                <td style="text-align: right;">${escapeHtml(item.completenessPercentage.toFixed(1))}%</td>
                <td style="text-align: right;">${escapeHtml(item.nullCount.toLocaleString())}</td>
                <td>${item.issues.length > 0 ? escapeHtml(item.issues.join('; ')) : 'None detected'}</td>
                <td>
                  <span class="kpi-badge badge-${item.severity === 'critical' ? 'negative' : item.severity === 'warning' ? 'warning' : 'positive'}">
                    ${escapeHtml(item.severity.toUpperCase())}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="table-caption">Scorecard covers 100% of rows analyzed across all attributes. Null percentages reflect unpopulated cells.</div>
      </div>
    </section>

    <!-- 5. Key Business Findings -->
    <section class="section">
      <h2>Ranked Strategic Findings & Recommendations</h2>
      ${findings.map((finding, idx) => `
        <div class="finding-card">
          <div class="finding-header">
            <span class="finding-title">#${idx + 1} &mdash; ${escapeHtml(finding.title)}</span>
            <span class="kpi-badge badge-${finding.importance === 'critical' ? 'negative' : finding.importance === 'high' ? 'warning' : 'neutral'}">
              ${escapeHtml(finding.importance.toUpperCase())} PRIORITY
            </span>
          </div>
          <div class="finding-body">
            <div class="finding-segment">
              <div class="segment-label label-fact">Observed Fact (Evidence-Backed)</div>
              <p>${escapeHtml(finding.observedFact)}</p>
            </div>
            <div class="finding-segment">
              <div class="segment-label label-hypo">Exploratory Hypothesis</div>
              <p>${escapeHtml(finding.hypothesis)}</p>
            </div>
            <div class="finding-segment">
              <div class="segment-label label-act">Recommended Action</div>
              <p>${escapeHtml(finding.recommendedAction)}</p>
            </div>
            ${finding.limitations.length > 0 ? `
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">
                <strong>Limitations / Caveats:</strong> ${escapeHtml(finding.limitations.join(' '))}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </section>

    <div class="page-break-after"></div>

    <!-- 6. Analytical Visualizations -->
    ${charts.length > 0 ? `
      <section class="section">
        <h2>Analytical Visualizations</h2>
        ${charts.map(chart => `
          <div class="chart-container">
            <div class="chart-header">
              <div class="chart-title">${escapeHtml(chart.title)}</div>
              ${chart.subtitle ? `<div class="chart-subtitle">${escapeHtml(chart.subtitle)}</div>` : ''}
            </div>
            ${renderSvgChart(chart)}
            <div class="chart-caption">${escapeHtml(chart.caption)}</div>
          </div>
        `).join('')}
      </section>
    ` : ''}

    <!-- 7. Detailed Tabular Results -->
    ${tables.length > 0 ? `
      <section class="section">
        <h2>Detailed Tabular Summaries</h2>
        ${tables.map(table => `
          <div class="report-table-wrapper">
            <h3>${escapeHtml(table.title)}</h3>
            <table class="report-table">
              <thead>
                <tr>
                  ${table.columns.map(col => `
                    <th style="text-align: ${escapeHtml(col.align)};">${escapeHtml(col.header)}</th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${table.rows.map(row => `
                  <tr>
                    ${table.columns.map(col => `
                      <td style="text-align: ${escapeHtml(col.align)};">${escapeHtml(row[col.key])}</td>
                    `).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="table-caption">${escapeHtml(table.caption)}</div>
          </div>
        `).join('')}
      </section>
    ` : ''}

    <!-- 8. Statistical Analysis (Correlations & Outliers) -->
    <section class="section avoid-break">
      <h2>Statistical Distribution &amp; Association Analysis</h2>
      
      <div class="alert-causation">
        <strong>${escapeHtml(statisticalAnalysis.nonCausationNotice)}</strong>
      </div>

      ${statisticalAnalysis.trendsSummary ? `
        <p style="margin-bottom: 12px;"><strong>Temporal Trend Assessment:</strong> ${escapeHtml(statisticalAnalysis.trendsSummary)}</p>
      ` : ''}

      ${statisticalAnalysis.correlations.length > 0 ? `
        <div class="report-table-wrapper">
          <h3>Pairwise Pearson Correlation Analysis</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>Variable A</th>
                <th>Variable B</th>
                <th style="text-align: right;">Pearson r</th>
                <th style="text-align: right;">Sample Size (N)</th>
                <th>Statistical Interpretation</th>
              </tr>
            </thead>
            <tbody>
              ${statisticalAnalysis.correlations.map(corr => `
                <tr>
                  <td><strong>${escapeHtml(corr.variableA)}</strong></td>
                  <td><strong>${escapeHtml(corr.variableB)}</strong></td>
                  <td style="text-align: right; font-weight: 700;">${escapeHtml(corr.pearsonCoefficient.toFixed(3))}</td>
                  <td style="text-align: right;">${escapeHtml(corr.sampleSize.toLocaleString())}</td>
                  <td>${escapeHtml(corr.interpretation)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p style="color: var(--text-muted); font-style: italic;">No continuous numeric pairs available for correlation analysis.</p>'}

      ${statisticalAnalysis.outliers.length > 0 ? `
        <div class="report-table-wrapper" style="margin-top: 14px;">
          <h3>Identified Statistical Outliers (Tukey IQR Criterion)</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>Column</th>
                <th style="text-align: right;">Outlier Count</th>
                <th style="text-align: right;">% of Records</th>
                <th>Acceptable Bounds [Lower, Upper]</th>
                <th>Business Implication</th>
              </tr>
            </thead>
            <tbody>
              ${statisticalAnalysis.outliers.map(out => `
                <tr>
                  <td><strong>${escapeHtml(out.column)}</strong></td>
                  <td style="text-align: right;">${escapeHtml(out.outlierCount.toLocaleString())}</td>
                  <td style="text-align: right;">${escapeHtml(out.outlierPercentage.toFixed(1))}%</td>
                  <td>[${out.lowerBound !== null ? escapeHtml(out.lowerBound.toFixed(2)) : '-&infin;'}, ${out.upperBound !== null ? escapeHtml(out.upperBound.toFixed(2)) : '+&infin;'}]</td>
                  <td>${escapeHtml(out.businessImplication)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </section>

    <!-- 9. Methodology, Provenance & Appendix -->
    <section class="section avoid-break">
      <h2>Methodology, Limitations & Provenance</h2>
      <div style="font-size: 11px; margin-bottom: 12px; line-height: 1.5;">
        <p><strong>Analytical Engine:</strong> ${escapeHtml(methodology.analyticalEngine)}</p>
        <p><strong>Data Profiling Method:</strong> ${escapeHtml(methodology.profilingMethod)}</p>
        <p><strong>Source File:</strong> ${escapeHtml(methodology.dataProvenance.sourcePath)}</p>
        <p><strong>Analysis Execution Time:</strong> ${escapeHtml(methodology.dataProvenance.executionDurationMs)} ms</p>
      </div>

      <h3>Statistical Appendix & Metric Definitions</h3>
      <div class="appendix-grid">
        ${appendix.map(app => `
          <div class="appendix-item">
            <div class="appendix-term">${escapeHtml(app.term)}</div>
            ${app.formulaOrRule ? `<div class="appendix-formula">${escapeHtml(app.formulaOrRule)}</div>` : ''}
            <div class="appendix-desc">${escapeHtml(app.explanation)}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Footer -->
    <footer class="report-footer">
      <div>Generated by <strong>${escapeHtml(metadata.author)}</strong> | ${escapeHtml(metadata.engine)}</div>
      <div>Confidential &mdash; For Internal Executive Review Only</div>
    </footer>

  </div>
</body>
</html>`;
}
