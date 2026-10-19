import { describe, it, expect } from 'vitest';
import {
  REPORT_SCHEMA_VERSION,
  ReportSpecSchema,
  ReportMetadataSchema,
  ExecutiveSummarySchema,
  type ReportSpec,
} from '../../src/lib/report/types.js';

describe('ReportSpec Schema and Type Invariants', () => {
  const validMockReport: ReportSpec = {
    version: REPORT_SCHEMA_VERSION,
    metadata: {
      id: 'report-123',
      title: 'Sales Performance Executive Summary',
      subtitle: 'Q3 Analytics Review',
      datasetName: 'sample_sales.csv',
      datasetRowCount: 100,
      datasetColumnCount: 8,
      reportingPeriod: {
        startDate: '2023-01-01',
        endDate: '2023-03-31',
        durationDays: 90,
        periodType: 'daily',
      },
      generatedAt: new Date().toISOString(),
      author: 'Autonomous Data Analyst',
      engine: 'DuckDB In-Process Engine',
      scope: 'Full 100 rows analyzed',
      isAggregateComplete: true,
      completenessScore: 98.5,
    },
    executiveSummary: {
      headline: 'Revenue increased by 14.2% across North America regions',
      primaryTakeaways: ['High demand in enterprise category', 'Return rate dropped below 2%'],
      businessImplications: ['Increase marketing spend in tier 1 segments'],
      dataTrustRating: 'high',
      dataTrustSummary: '98.5% completeness with 0 critical anomalies',
    },
    kpis: [
      {
        id: 'kpi-1',
        name: 'Total Revenue',
        value: 1250000,
        formattedValue: '$1.25M',
        unit: 'USD',
        definition: 'Sum of all validated transactions',
        changePercentage: 14.2,
        comparisonPeriod: 'Prior Quarter',
        trendDirection: 'up',
        status: 'positive',
        evidenceRef: 'duckdb.revenue.sum',
      },
    ],
    qualityAssessment: {
      overallScore: 98.5,
      status: 'good',
      totalRecords: 100,
      totalColumns: 8,
      columnsWithNullsCount: 1,
      summaryNotes: ['Minor nulls in shipping_notes'],
      scorecard: [
        {
          column: 'revenue',
          dataType: 'NUMERIC',
          completenessPercentage: 100,
          nullCount: 0,
          issues: [],
          severity: 'info',
        },
      ],
    },
    findings: [
      {
        id: 'finding-1',
        title: 'Enterprise Segment Dominance',
        importance: 'high',
        category: 'revenue_concentration',
        observedFact: 'Top 3 clients account for 42% of gross revenue',
        hypothesis: 'Recent contract consolidations concentrated pipeline',
        recommendedAction: 'Diversify mid-market outreach to reduce key-account risk',
        supportingMetrics: { top3Share: 0.42 },
        confidence: 'high',
        confidenceReason: 'Calculated directly on full transaction ledger',
        limitations: ['Does not include pending contracts in CRM'],
      },
    ],
    charts: [
      {
        id: 'chart-1',
        title: 'Monthly Revenue Progression',
        chartType: 'line',
        data: [{ label: 'Jan', value: 300000 }, { label: 'Feb', value: 420000 }],
        caption: 'Revenue grew steadily month over month',
        evidenceRef: 'monthly_totals',
      },
    ],
    tables: [
      {
        id: 'table-1',
        title: 'Regional Revenue Breakdown',
        columns: [
          { key: 'region', header: 'Region', align: 'left' },
          { key: 'revenue', header: 'Revenue', align: 'right' },
        ],
        rows: [{ region: 'North America', revenue: '$850,000' }],
        caption: 'All regional revenue totals',
        isTruncated: false,
      },
    ],
    statisticalAnalysis: {
      trendsSummary: 'Increasing trend observed across all quarters',
      correlations: [
        {
          variableA: 'discount',
          variableB: 'order_size',
          pearsonCoefficient: 0.45,
          sampleSize: 100,
          interpretation: 'Moderate positive linear correlation',
          causationCaveat: 'Higher discounts do not necessarily cause larger orders',
        },
      ],
      outliers: [
        {
          column: 'order_size',
          outlierCount: 2,
          outlierPercentage: 2.0,
          lowerBound: 0,
          upperBound: 500,
          businessImplication: 'Two bulk wholesale orders identified',
        },
      ],
      nonCausationNotice: 'Correlation does not establish cause-and-effect.',
    },
    methodology: {
      analyticalEngine: 'DuckDB',
      profilingMethod: 'Streaming scan',
      statisticalTechniques: ['IQR', 'Pearson r'],
      filtersApplied: ['None'],
      assumptions: ['Standard currency format'],
      limitations: ['Historical data only'],
      dataProvenance: {
        sourcePath: '/path/to/dataset.csv',
        analyzedAt: new Date().toISOString(),
        executionDurationMs: 145,
      },
    },
    appendix: [
      {
        term: 'IQR Outlier Rule',
        formulaOrRule: '1.5 * IQR',
        explanation: 'Standard statistical outlier threshold',
      },
    ],
  };

  it('validates a complete and compliant ReportSpec successfully', () => {
    const parsed = ReportSpecSchema.parse(validMockReport);
    expect(parsed.version).toBe(REPORT_SCHEMA_VERSION);
    expect(parsed.metadata.title).toBe('Sales Performance Executive Summary');
    expect(parsed.kpis.length).toBe(1);
    expect(parsed.findings.length).toBe(1);
  });

  it('rejects an invalid version or missing mandatory metadata', () => {
    expect(() => {
      ReportSpecSchema.parse({
        ...validMockReport,
        version: '2.0.0', // invalid version
      });
    }).toThrow();

    expect(() => {
      ReportSpecSchema.parse({
        ...validMockReport,
        metadata: {
          ...validMockReport.metadata,
          completenessScore: 150, // out of 0-100 range
        },
      });
    }).toThrow();
  });

  it('enforces non-empty title and valid trust ratings', () => {
    expect(() => {
      ReportMetadataSchema.parse({
        ...validMockReport.metadata,
        title: '',
      });
    }).toThrow();

    expect(() => {
      ExecutiveSummarySchema.parse({
        ...validMockReport.executiveSummary,
        dataTrustRating: 'unverified' as any,
      });
    }).toThrow();
  });
});
