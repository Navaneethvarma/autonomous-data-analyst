import { describe, it, expect } from 'vitest';
import {
  DashboardSpecSchema,
  DASHBOARD_SCHEMA_VERSION,
  MAX_CHARTS_PER_DASHBOARD,
  MAX_KPIS_PER_DASHBOARD,
  MAX_DATA_POINTS_PER_CHART,
  MAX_TABLE_ROWS,
  type DashboardSpec,
} from '../../src/lib/dashboard/types.js';

describe('DashboardSpec Schema & Guardrails', () => {
  const validSpec: DashboardSpec = {
    version: DASHBOARD_SCHEMA_VERSION,
    metadata: {
      id: 'dash_valid_01',
      title: 'Valid Test Dashboard',
      description: 'Comprehensive test dashboard for schema validation',
      datasetName: 'test.csv',
      datasetRowCount: 100,
      datasetColumnCount: 5,
      completenessScore: 98.5,
      isAggregateComplete: true,
      isDisplayTruncated: false,
      generatedAt: new Date().toISOString(),
      engine: 'DuckDB in-memory analytical statistical engine v1.4.4',
    },
    kpis: [
      {
        id: 'kpi_test',
        label: 'Total Revenue',
        value: 125000,
        formattedValue: '$125,000',
        unit: '$',
        change: 12.5,
        changePeriod: 'vs prior period',
        trendDirection: 'up',
        definition: 'Total verified sales revenue',
        evidenceRef: 'SUM(revenue) = 125000',
        status: 'positive',
      },
    ],
    charts: [
      {
        id: 'chart_bar_test',
        title: 'Category Breakdown',
        description: 'Sales volume across categories',
        chartType: 'bar',
        categories: ['Electronics', 'Apparel'],
        series: [
          {
            name: 'Volume',
            data: [50, 30],
          },
        ],
        evidenceRef: 'COUNT(*) GROUP BY category',
        affectedColumns: ['category'],
        width: 'half',
      },
    ],
    table: {
      id: 'table_test',
      title: 'Records Table',
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'category', label: 'Category', type: 'string' },
      ],
      rows: [{ id: 1, category: 'Electronics' }],
      totalRowCount: 100,
      displayRowCount: 1,
      isTruncated: false,
      pageSize: 10,
      defaultSortDirection: 'asc',
    },
    filters: [
      {
        id: 'filter_category',
        column: 'category',
        label: 'Category',
        type: 'category_select',
        options: ['All', 'Electronics', 'Apparel'],
      },
    ],
    insights: [
      {
        id: 'ins_01',
        title: 'High Concentration in Electronics',
        category: 'revenue_concentration',
        importance: 'high',
        observedFact: 'Electronics accounts for 60% of all volume.',
        hypothesis: 'Promotion drove elevated sales.',
        recommendation: 'Evaluate secondary categories for balance.',
        analyticalMethod: 'frequency_concentration_analysis',
        confidence: 'high',
        affectedColumns: ['category'],
      },
    ],
    guardrails: {
      maxChartCount: MAX_CHARTS_PER_DASHBOARD,
      maxDataPointsPerChart: MAX_DATA_POINTS_PER_CHART,
      maxTableRows: MAX_TABLE_ROWS,
    },
  };

  it('validates a conformant DashboardSpec successfully', () => {
    expect(() => DashboardSpecSchema.parse(validSpec)).not.toThrow();
  });

  it('rejects unsupported chart types', () => {
    const invalidSpec = {
      ...validSpec,
      charts: [
        {
          ...validSpec.charts[0]!,
          chartType: 'unsupported_3d_globe_view',
        },
      ],
    };
    expect(() => DashboardSpecSchema.parse(invalidSpec)).toThrow();
  });

  it('rejects specs exceeding maximum chart count guardrail', () => {
    const tooManyCharts = Array.from({ length: MAX_CHARTS_PER_DASHBOARD + 1 }, (_, i) => ({
      ...validSpec.charts[0]!,
      id: `chart_${i}`,
    }));

    const invalidSpec = {
      ...validSpec,
      charts: tooManyCharts,
    };
    expect(() => DashboardSpecSchema.parse(invalidSpec)).toThrow();
  });

  it('rejects specs exceeding maximum KPI card count', () => {
    const tooManyKpis = Array.from({ length: MAX_KPIS_PER_DASHBOARD + 1 }, (_, i) => ({
      ...validSpec.kpis[0]!,
      id: `kpi_${i}`,
    }));

    const invalidSpec = {
      ...validSpec,
      kpis: tooManyKpis,
    };
    expect(() => DashboardSpecSchema.parse(invalidSpec)).toThrow();
  });

  it('enforces non-causation warning on correlation matrix when present', () => {
    const specWithCorr: DashboardSpec = {
      ...validSpec,
      correlationMatrix: {
        id: 'matrix_corr',
        title: 'Correlation Matrix',
        columns: ['colA', 'colB'],
        matrix: [
          {
            columnA: 'colA',
            columnB: 'colB',
            coefficient: 0.85,
            strength: 'strong_positive',
            sampleSize: 100,
          },
        ],
        causationWarning: 'CRITICAL: Correlation does not demonstrate or imply causation.',
        evidenceRef: 'DuckDB CORR(colA, colB)',
      },
    };

    const parsed = DashboardSpecSchema.parse(specWithCorr);
    expect(parsed.correlationMatrix?.causationWarning).toContain('does not demonstrate or imply causation');
  });

  it('rejects negative row counts or invalid completeness scores', () => {
    const invalidNegative = {
      ...validSpec,
      metadata: {
        ...validSpec.metadata,
        datasetRowCount: -5,
      },
    };
    expect(() => DashboardSpecSchema.parse(invalidNegative)).toThrow();

    const invalidCompleteness = {
      ...validSpec,
      metadata: {
        ...validSpec.metadata,
        completenessScore: 150, // Max is 100
      },
    };
    expect(() => DashboardSpecSchema.parse(invalidCompleteness)).toThrow();
  });
});
