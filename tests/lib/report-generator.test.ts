import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { generateReportSpec, buildReportSpecFromEda } from '../../src/lib/report/generator.js';
import { escapeHtml } from '../../src/lib/report/html-renderer.js';
import { runAutomatedEda } from '../../src/lib/analytics/eda-engine.js';
import { REPORT_SCHEMA_VERSION } from '../../src/lib/report/types.js';

describe('ReportSpec Generator Engine', { timeout: 25000 }, () => {
  const sampleSalesPath = path.resolve(process.cwd(), 'datasets/sample_sales.csv');

  it('generates a complete, validated ReportSpec from sample_sales.csv', async () => {
    const report = await generateReportSpec(sampleSalesPath, {
      title: 'Executive Sales Analysis Q1-Q3',
      temporalDateColumn: 'transaction_date',
      temporalMetricColumn: 'unit_price',
    });

    expect(report.version).toBe(REPORT_SCHEMA_VERSION);
    expect(report.metadata.title).toBe('Executive Sales Analysis Q1-Q3');
    expect(report.metadata.datasetRowCount).toBe(10);
    expect(report.metadata.datasetColumnCount).toBeGreaterThanOrEqual(7);
    expect(report.metadata.completenessScore).toBeGreaterThanOrEqual(90);

    // Temporal reporting period
    expect(report.metadata.reportingPeriod).toBeDefined();
    expect(report.metadata.reportingPeriod?.startDate).toBe('2024-01-10');
    expect(report.metadata.reportingPeriod?.endDate).toBe('2024-01-30');

    // KPIs check
    expect(report.kpis.length).toBeGreaterThanOrEqual(3);
    const recordsKpi = report.kpis.find(k => k.id === 'kpi-records');
    expect(recordsKpi?.value).toBe(10);
    expect(recordsKpi?.evidenceRef).toBe('eda.rowCount');

    // Findings check
    expect(report.findings.length).toBeGreaterThanOrEqual(1);
    for (const finding of report.findings) {
      expect(finding.observedFact).toBeTruthy();
      expect(finding.hypothesis).toBeTruthy();
      expect(finding.recommendedAction).toBeTruthy();
      expect(finding.confidenceReason).toBeTruthy();
    }

    // Quality Scorecard check
    expect(report.qualityAssessment.scorecard.length).toBeGreaterThanOrEqual(5);
    expect(report.qualityAssessment.overallScore).toBe(report.metadata.completenessScore);

    // Statistical analysis check
    expect(report.statisticalAnalysis.nonCausationNotice).toContain('Correlation measures mathematical association');
    expect(report.statisticalAnalysis.correlations.length).toBeGreaterThan(0);
    for (const corr of report.statisticalAnalysis.correlations) {
      expect(corr.causationCaveat).toBeTruthy();
    }

    // Appendix check
    expect(report.appendix.length).toBeGreaterThanOrEqual(3);
    const iqrItem = report.appendix.find(a => a.term.includes('IQR'));
    expect(iqrItem).toBeDefined();
  });

  it('handles dataset generation without temporal column gracefully', async () => {
    const edaResult = await runAutomatedEda({
      datasetPath: sampleSalesPath,
      includeCorrelations: true,
    });

    // Provide edaResult with empty temporalAnalyses to test atemporal path
    const atemporalEda = {
      ...edaResult,
      temporalAnalyses: [],
    };

    const report = buildReportSpecFromEda(atemporalEda, {
      title: 'Atemporal Report Test',
    });

    expect(report.metadata.reportingPeriod).toBeUndefined();
    expect(report.statisticalAnalysis.trendsSummary).toContain('No valid timestamp or date dimension detected');
    // Ensure no temporal KPI comparisons are fabricated
    const kpisWithComparison = report.kpis.filter(k => Boolean(k.comparisonPeriod));
    expect(kpisWithComparison.length).toBe(0);
  });

  it('escapes untrusted input and prevents HTML/script injection', () => {
    const maliciousInput = '<script>alert("XSS")</script>&foo=\'bar"';
    const escaped = escapeHtml(maliciousInput);

    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&amp;foo=');
    expect(escaped).toContain('&#39;bar&quot;');
  });
});
