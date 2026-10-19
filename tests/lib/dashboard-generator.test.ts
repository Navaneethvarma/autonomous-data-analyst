import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateDashboardSpec } from '../../src/lib/dashboard/generator.js';
import { DashboardSpecSchema } from '../../src/lib/dashboard/types.js';

describe('Dashboard Generator Engine', { timeout: 25000 }, () => {
  const testBaseDir = path.resolve(process.cwd(), 'tests/fixtures/dashboard_sandbox');
  const csvFile = 'dashboard_test_sales.csv';
  const emptyCsv = 'dashboard_empty.csv';

  beforeAll(() => {
    fs.mkdirSync(testBaseDir, { recursive: true });

    const content = [
      'txn_id,txn_date,category,unit_price,quantity,status',
      'T1,2026-01-01,Tech,500,1,completed',
      'T2,2026-01-05,Tech,300,2,completed',
      'T3,2026-01-10,Apparel,50,5,completed',
      'T4,2026-01-15,Apparel,80,3,refunded',
      'T5,2026-01-20,Home,120,2,completed',
      'T6,2026-01-25,Tech,900,1,completed', // outlier
      'T7,2026-01-30,Home,150,1,pending',
    ].join('\n');
    fs.writeFileSync(path.join(testBaseDir, csvFile), content, 'utf-8');

    const emptyContent = 'col_1,col_2,col_3\n';
    fs.writeFileSync(path.join(testBaseDir, emptyCsv), emptyContent, 'utf-8');
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch {
      // Windows lock
    }
  });

  it('generates a complete, valid DashboardSpec from raw dataset', async () => {
    const spec = await generateDashboardSpec(
      {
        datasetPath: csvFile,
        title: 'Custom Sales Operations Dashboard',
        rowLimit: 20,
      },
      { customBaseDir: testBaseDir }
    );

    // Validate schema
    expect(() => DashboardSpecSchema.parse(spec)).not.toThrow();
    expect(spec.version).toBe('1.0.0');
    expect(spec.metadata.title).toBe('Custom Sales Operations Dashboard');
    expect(spec.metadata.datasetRowCount).toBe(7);
    expect(spec.metadata.datasetColumnCount).toBe(6);
    expect(spec.metadata.completenessScore).toBe(100);
    expect(spec.metadata.isAggregateComplete).toBe(true);

    // Verify KPI cards
    expect(spec.kpis.length).toBeGreaterThanOrEqual(2);
    const totalRecordsKpi = spec.kpis.find(k => k.id === 'kpi_total_records');
    expect(totalRecordsKpi?.value).toBe(7);

    // Verify Charts
    expect(spec.charts.length).toBeGreaterThan(0);
    // Categorical charts
    const catChart = spec.charts.find(c => c.affectedColumns.includes('category'));
    expect(catChart).toBeDefined();

    // Time-series chart
    const trendChart = spec.charts.find(c => c.chartType === 'line');
    expect(trendChart).toBeDefined();

    // Data table
    expect(spec.table.totalRowCount).toBe(7);
    expect(spec.table.rows.length).toBe(7);
    expect(spec.table.columns.length).toBe(6);

    // Interactive filters
    expect(spec.filters.length).toBeGreaterThan(0);

    // Insights
    expect(spec.insights.length).toBeGreaterThan(0);
    for (const ins of spec.insights) {
      expect(ins.observedFact.length).toBeGreaterThan(10);
      expect(ins.hypothesis.length).toBeGreaterThan(10);
      expect(ins.recommendation.length).toBeGreaterThan(10);
    }
  });

  it('handles completely empty datasets (0 rows) safely', async () => {
    const spec = await generateDashboardSpec(
      { datasetPath: emptyCsv },
      { customBaseDir: testBaseDir }
    );

    expect(() => DashboardSpecSchema.parse(spec)).not.toThrow();
    expect(spec.metadata.datasetRowCount).toBe(0);
    expect(spec.metadata.completenessScore).toBe(0);
    expect(spec.charts).toEqual([]);
    expect(spec.insights.some(i => i.id === 'ins_empty_dataset')).toBe(true);
  });
});
