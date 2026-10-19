import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { generateReportSpec } from '../../src/lib/report/generator.js';
import { renderReportHtml } from '../../src/lib/report/html-renderer.js';
import {
  exportPdfFromHtml,
  detectBrowserExecutable,
  isPdfGenerationSupported,
} from '../../src/lib/report/pdf-generator.js';
import type { ReportSpec } from '../../src/lib/report/types.js';

describe('Report HTML Renderer and PDF Export', () => {
  const sampleSalesPath = path.resolve(process.cwd(), 'datasets/sample_sales.csv');
  const tempPdfPath = path.resolve(process.cwd(), 'reports/test-output-m7.pdf');
  let report: ReportSpec;
  let html: string;

  beforeAll(async () => {
    report = await generateReportSpec(sampleSalesPath, {
      title: 'Executive HTML Print Test',
      temporalDateColumn: 'transaction_date',
      temporalMetricColumn: 'unit_price',
    });
    html = renderReportHtml(report);
  });

  afterAll(async () => {
    if (fs.existsSync(tempPdfPath)) {
      await fs.promises.unlink(tempPdfPath).catch(() => {});
    }
  });

  it('renders semantic, accessible HTML with print stylesheets and vector charts', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@media print');
    expect(html).toContain('@page');
    expect(html).toContain('page-break-after: always');
    expect(html).toContain('report-svg-chart');
    expect(html).toContain('Executive HTML Print Test');
    expect(html).toContain('Data Quality &amp; Completeness Scorecard');
    expect(html).toContain('Statistical Distribution &amp; Association Analysis');
    expect(html).toContain('CRITICAL STATISTICAL NOTICE');
  });

  it('detects system browser and exports a valid binary PDF with magic header', async () => {
    const isSupported = isPdfGenerationSupported();
    const browserPath = detectBrowserExecutable();

    // In this Windows workstation environment, Chrome or Edge is present
    expect(browserPath).not.toBeNull();
    expect(isSupported).toBe(true);

    const result = await exportPdfFromHtml(html, tempPdfPath);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(10000); // realistic multi-page PDF

    // Verify PDF Magic Bytes: %PDF-
    const header = result.buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // Verify written file on disk
    expect(fs.existsSync(tempPdfPath)).toBe(true);
    const fileStats = fs.statSync(tempPdfPath);
    expect(fileStats.size).toBe(result.buffer.length);
  }, 25000);
});
