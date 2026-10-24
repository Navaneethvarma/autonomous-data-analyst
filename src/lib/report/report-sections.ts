import type { ReportSpec } from './types.js';
import { escapeHtml, renderSvgChart } from './svg-charts.js';

export function renderHeaderSection(metadata: ReportSpec['metadata']): string {
  return `
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
  `;
}

export function renderExecutiveSummarySection(executiveSummary: ReportSpec['executiveSummary']): string {
  return `
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
  `;
}

export function renderKpisSection(kpis: ReportSpec['kpis']): string {
  return `
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
  `;
}

export function renderQualitySection(qualityAssessment: ReportSpec['qualityAssessment']): string {
  return `
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
  `;
}

export function renderFindingsSection(findings: ReportSpec['findings']): string {
  return `
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
  `;
}

export function renderVisualizationsSection(charts: ReportSpec['charts']): string {
  if (charts.length === 0) return '';
  return `
    <!-- 6. Analytical Visualizations -->
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
  `;
}

export function renderTabularSection(tables: ReportSpec['tables']): string {
  if (tables.length === 0) return '';
  return `
    <!-- 7. Detailed Tabular Results -->
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
  `;
}

export function renderStatisticalSection(statisticalAnalysis: ReportSpec['statisticalAnalysis']): string {
  return `
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
  `;
}

export function renderMethodologySection(
  methodology: ReportSpec['methodology'],
  appendix: ReportSpec['appendix']
): string {
  return `
    <!-- 9. Methodology, Limitations & Provenance -->
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
  `;
}

export function renderFooterSection(metadata: ReportSpec['metadata']): string {
  return `
    <!-- Footer -->
    <footer class="report-footer">
      <div>Generated by <strong>${escapeHtml(metadata.author)}</strong> | ${escapeHtml(metadata.engine)}</div>
      <div>Confidential &mdash; For Internal Executive Review Only</div>
    </footer>
  `;
}
