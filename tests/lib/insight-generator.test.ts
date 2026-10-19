import { describe, it, expect } from 'vitest';
import {
  generateBusinessInsights,
  buildEdaAndInsightsResult,
} from '../../src/lib/analytics/insight-generator.js';
import {
  type DatasetEdaSummary,
  EdaAndInsightsResultSchema,
} from '../../src/lib/analytics/eda-types.js';

describe('Evidence-Backed Business Insight Generator', () => {
  const mockEdaSummary: DatasetEdaSummary = {
    datasetName: 'sales_performance.csv',
    rowCount: 100,
    columnCount: 5,
    completenessScore: 95.5,
    numericDistributions: [
      {
        column: 'revenue',
        count: 100,
        nullCount: 0,
        nullPercentage: 0,
        min: 50,
        max: 9500, // heavy outlier
        mean: 450,
        median: 250,
        stdDev: 920,
        variance: 846400,
        p25: 150,
        p75: 400,
        iqr: 250,
        skewness: 4.2, // severe skewness
        kurtosis: 18.5,
        isConstant: false,
        outlierCount: 6,
        outlierPercentage: 6.0,
        outlierBounds: { lowerBound: -225, upperBound: 775 },
      },
      {
        column: 'margin_pct',
        count: 100,
        nullCount: 0,
        nullPercentage: 0,
        min: 15,
        max: 85,
        mean: 42,
        median: 40,
        stdDev: 12,
        variance: 144,
        p25: 32,
        p75: 50,
        iqr: 18,
        skewness: 0.2,
        kurtosis: -0.1,
        isConstant: false,
        outlierCount: 0,
        outlierPercentage: 0,
        outlierBounds: { lowerBound: 5, upperBound: 77 },
      },
    ],
    categoricalDistributions: [
      {
        column: 'region',
        totalCount: 100,
        nullCount: 0,
        nullPercentage: 0,
        distinctCount: 4,
        uniqueRatio: 0.04,
        isConstant: false,
        isHighCardinality: false,
        mode: 'North America',
        modeCount: 65,
        topValues: [
          { value: 'North America', count: 65, percentage: 65 },
          { value: 'EMEA', count: 20, percentage: 20 },
          { value: 'APAC', count: 10, percentage: 10 },
          { value: 'LATAM', count: 5, percentage: 5 },
        ],
        concentrationPercentage: 65,
      },
    ],
    temporalAnalyses: [
      {
        dateColumn: 'order_date',
        minDate: '2026-01-01',
        maxDate: '2026-01-31',
        rangeDays: 30,
        totalRecords: 100,
        periodType: 'daily',
        trendDirection: 'increasing',
        growthRatePercentage: 45.5,
        dataPoints: [
          { period: '2026-01-01', count: 10, metricSum: 2000 },
          { period: '2026-01-31', count: 25, metricSum: 6000 },
        ],
        anomalousPeriods: ['2026-01-15'],
      },
    ],
    correlations: [
      {
        columnA: 'revenue',
        columnB: 'margin_pct',
        sampleSize: 100,
        pearsonCoefficient: 0.78,
        strength: 'strong_positive',
        causationCaveat: 'Correlation does not imply causation.',
      },
    ],
    qualityIssues: [
      {
        type: 'high_missingness',
        severity: 'warning',
        column: 'discount_code',
        message: 'Column discount_code exhibits 45% missingness.',
        metricValue: 45,
      },
    ],
    analyzedAt: new Date().toISOString(),
    executionTimeMs: 42,
  };

  it('generates structured insights adhering strictly to fact vs hypothesis vs recommendation separation', () => {
    const insights = generateBusinessInsights(mockEdaSummary);

    expect(insights.length).toBeGreaterThan(0);

    for (const insight of insights) {
      expect(insight.id).toBeDefined();
      expect(insight.title.length).toBeGreaterThan(5);
      expect(insight.observedFact.length).toBeGreaterThan(15);
      expect(insight.hypothesis.length).toBeGreaterThan(15);
      expect(insight.recommendation.length).toBeGreaterThan(15);
      expect(insight.analyticalMethod.length).toBeGreaterThan(3);
      expect(insight.confidenceReason.length).toBeGreaterThan(10);
      expect(insight.limitations.length).toBeGreaterThan(0);
      expect(Object.keys(insight.supportingMetrics).length).toBeGreaterThan(0);
    }
  });

  it('ranks insights by importance (critical/high before medium/low)', () => {
    const insights = generateBusinessInsights(mockEdaSummary);

    const importanceWeights = { critical: 4, high: 3, medium: 2, low: 1 };
    for (let i = 0; i < insights.length - 1; i++) {
      const current = importanceWeights[insights[i]!.importance];
      const next = importanceWeights[insights[i + 1]!.importance];
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it('enforces strict anti-causation safeguards on correlation insights', () => {
    const insights = generateBusinessInsights(mockEdaSummary);
    const corrInsight = insights.find(ins => ins.category === 'correlation_analysis');

    expect(corrInsight).toBeDefined();
    expect(corrInsight?.limitations.some(lim => lim.toLowerCase().includes('not demonstrate or imply causation'))).toBe(true);
    expect(corrInsight?.recommendation).toContain('A/B test or multivariate regression to verify whether an actual causal mechanism exists');
  });

  it('grounds supporting metrics in actual computed statistics without hallucination', () => {
    const insights = generateBusinessInsights(mockEdaSummary);
    const concInsight = insights.find(ins => ins.category === 'revenue_concentration');

    expect(concInsight).toBeDefined();
    expect(concInsight?.supportingMetrics.concentrationPercentage).toBe(65);
    expect(concInsight?.supportingMetrics.mode).toBe('North America');
    expect(concInsight?.supportingMetrics.modeCount).toBe(65);
    expect(concInsight?.supportingMetrics.totalCount).toBe(100);
  });

  it('builds a full versioned result matching EdaAndInsightsResultSchema', () => {
    const insights = generateBusinessInsights(mockEdaSummary);
    const fullResult = buildEdaAndInsightsResult(mockEdaSummary, insights);

    const parsed = EdaAndInsightsResultSchema.parse(fullResult);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.dataset).toBe('sales_performance.csv');
    expect(parsed.provenance.engine).toContain('DuckDB');
    expect(parsed.insights.length).toBe(insights.length);
  });
});
