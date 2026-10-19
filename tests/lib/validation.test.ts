import { describe, it, expect } from 'vitest';
import { validateAnalysisResult } from '../../src/lib/dataset/validation.js';

describe('Analytical Result Validation Engine', () => {
  it('validates not_null_or_empty rule', () => {
    // Valid values
    expect(
      validateAnalysisResult({
        metricName: 'total_orders',
        metricValue: 120,
        rule: { type: 'not_null_or_empty' },
      }).isValid
    ).toBe(true);

    // Invalid values
    expect(
      validateAnalysisResult({
        metricName: 'total_orders',
        metricValue: null,
        rule: { type: 'not_null_or_empty' },
      }).isValid
    ).toBe(false);

    expect(
      validateAnalysisResult({
        metricName: 'total_orders',
        metricValue: NaN,
        rule: { type: 'not_null_or_empty' },
      }).isValid
    ).toBe(false);

    expect(
      validateAnalysisResult({
        metricName: 'category',
        metricValue: '   ',
        rule: { type: 'not_null_or_empty' },
      }).isValid
    ).toBe(false);
  });

  it('validates non_negative rule with context', () => {
    // Non-negative passed
    const valid = validateAnalysisResult({
      metricName: 'headcount',
      metricValue: 45,
      rule: {
        type: 'non_negative',
        metricContext: 'Active full-time employee headcount',
      },
    });
    expect(valid.isValid).toBe(true);
    expect(valid.status).toBe('valid');

    // Negative rejected with context
    const invalid = validateAnalysisResult({
      metricName: 'headcount',
      metricValue: -3,
      rule: {
        type: 'non_negative',
        metricContext: 'Active full-time employee headcount',
      },
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.status).toBe('invalid');
    expect(invalid.details).toContain('Active full-time employee headcount');
  });

  it('validates percentage_bounded rule', () => {
    // 25.5% is within [0, 100]
    expect(
      validateAnalysisResult({
        metricName: 'churn_rate',
        metricValue: 25.5,
        rule: { type: 'percentage_bounded' },
      }).isValid
    ).toBe(true);

    // 105% is outside standard [0, 100]
    expect(
      validateAnalysisResult({
        metricName: 'churn_rate',
        metricValue: 105.0,
        rule: { type: 'percentage_bounded' },
      }).isValid
    ).toBe(false);

    // Custom percentage bounds (e.g. profit margin expected between -20% and 50%)
    const margin = validateAnalysisResult({
      metricName: 'operating_margin',
      metricValue: -5.0,
      rule: {
        type: 'percentage_bounded',
        min: -20,
        max: 50,
      },
    });
    expect(margin.isValid).toBe(true);
  });

  it('validates range_bounds rule with tolerance', () => {
    // Exact within bounds
    expect(
      validateAnalysisResult({
        metricName: 'temperature',
        metricValue: 22.0,
        rule: { type: 'range_bounds', min: 18.0, max: 26.0 },
      }).isValid
    ).toBe(true);

    // Exceeds max
    expect(
      validateAnalysisResult({
        metricName: 'temperature',
        metricValue: 28.5,
        rule: { type: 'range_bounds', min: 18.0, max: 26.0 },
      }).isValid
    ).toBe(false);

    // Within tolerance
    const tolCheck = validateAnalysisResult({
      metricName: 'price_target',
      metricValue: 100.04,
      rule: { type: 'range_bounds', min: 50.0, max: 100.0, tolerance: 0.05 },
    });
    expect(tolCheck.isValid).toBe(true);
  });

  it('validates reconciliation_sum rule accurately', () => {
    // Sum matches components: 500 + 300 + 200 = 1000
    const match = validateAnalysisResult({
      metricName: 'total_revenue',
      metricValue: 1000.0,
      rule: {
        type: 'reconciliation_sum',
        components: [500.0, 300.0, 200.0],
      },
    });
    expect(match.isValid).toBe(true);
    expect(match.status).toBe('valid');

    // Sum discrepancy: 500 + 300 + 200 = 1000 != 950
    const mismatch = validateAnalysisResult({
      metricName: 'total_revenue',
      metricValue: 950.0,
      rule: {
        type: 'reconciliation_sum',
        components: [500.0, 300.0, 200.0],
        tolerance: 0.01,
      },
    });
    expect(mismatch.isValid).toBe(false);
    expect(mismatch.status).toBe('invalid');
    expect(mismatch.details).toContain('Reconciliation failed');

    // Missing component breakdown results in 'unverifiable' rather than false assertion
    const unverifiable = validateAnalysisResult({
      metricName: 'total_revenue',
      metricValue: 1000.0,
      rule: {
        type: 'reconciliation_sum',
        components: [],
      },
    });
    expect(unverifiable.isValid).toBe(false);
    expect(unverifiable.status).toBe('unverifiable');
    expect(unverifiable.details).toContain('no component breakdown array was provided');
  });

  it('validates custom_assertion rule and handles unverifiable status', () => {
    // Assertion evaluated as true
    const pass = validateAnalysisResult({
      metricName: 'net_income',
      metricValue: 250000,
      rule: {
        type: 'custom_assertion',
        assertionDescription: 'Net income must be positive in FY2023',
        assertionPassed: true,
      },
    });
    expect(pass.isValid).toBe(true);
    expect(pass.status).toBe('valid');

    // Assertion evaluated as false
    const fail = validateAnalysisResult({
      metricName: 'net_income',
      metricValue: -50000,
      rule: {
        type: 'custom_assertion',
        assertionDescription: 'Net income must be positive in FY2023',
        assertionPassed: false,
      },
    });
    expect(fail.isValid).toBe(false);
    expect(fail.status).toBe('invalid');

    // Assertion outcome missing -> unverifiable
    const unknown = validateAnalysisResult({
      metricName: 'net_income',
      metricValue: 250000,
      rule: {
        type: 'custom_assertion',
        assertionDescription: 'Net income satisfies audited GAAP requirements',
      },
    });
    expect(unknown.isValid).toBe(false);
    expect(unknown.status).toBe('unverifiable');
  });
});
