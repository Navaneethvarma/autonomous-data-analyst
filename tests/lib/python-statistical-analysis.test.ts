import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { executeSandboxedPython } from '../../src/lib/python/sandbox-runner.js';
import { PythonAnalysisRequest } from '../../src/lib/python/types.js';

describe('Python Statistical Correctness & Deterministic Fixtures (M8)', { timeout: 25000 }, () => {
  const fixturePath = path.join('tests', 'fixtures', 'python_stats_test.csv');

  it('computes exact descriptive statistics, moments, and Tukey outlier boundaries', async () => {
    const req: PythonAnalysisRequest = {
      taskId: 'stat-desc-1',
      taskType: 'descriptive_stats',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      parameters: { column: 'x' },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.sampleSize.totalRows).toBe(20);
    expect(res.sampleSize.validObservations).toBe(20);

    const m = res.numericResults;
    // Mean of 1..20 is 10.5
    expect(m.mean).toBeCloseTo(10.5, 2);
    expect(m.median).toBeCloseTo(10.5, 2);
    expect(m.min).toBe(1);
    expect(m.max).toBe(20);
    // Skewness of symmetric sequence 1..20 is 0.0
    expect(Math.abs(m.skewness)).toBeLessThan(0.01);
    // Outliers should be 0 for uniform progression
    expect(m.outlierCount).toBe(0);
    expect(m.outlierPercentage).toBe(0);
    // Confidence interval bounds bracket the mean
    expect(m.ci95Lower).toBeLessThan(10.5);
    expect(m.ci95Upper).toBeGreaterThan(10.5);
  });

  it('computes exact OLS linear regression metrics (slope, intercept, R², p-value)', async () => {
    // In fixture, y = 2*x + 5 exactly
    const req: PythonAnalysisRequest = {
      taskId: 'stat-reg-1',
      taskType: 'regression',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['x', 'y'],
      parameters: { independentColumn: 'x', dependentColumn: 'y' },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.sampleSize.validObservations).toBe(20);

    const r = res.numericResults;
    expect(r.slope).toBeCloseTo(2.0, 3);
    expect(r.intercept).toBeCloseTo(5.0, 3);
    expect(r.rSquared).toBeCloseTo(1.0, 3);
    expect(r.adjustedRSquared).toBeCloseTo(1.0, 3);
    expect(r.pearsonCorrelation).toBeCloseTo(1.0, 3);
    expect(r.isSignificant).toBe(true);
    expect(r.pValue).toBeLessThan(0.001);
  });

  it('performs Welch two-sample t-test and Cohen d effect size', async () => {
    // Group A (x=1..10, mean=5.5) vs Group B (x=11..20, mean=15.5)
    const req: PythonAnalysisRequest = {
      taskId: 'stat-ttest-1',
      taskType: 'group_comparison',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['x', 'group'],
      parameters: {
        metricColumn: 'x',
        groupColumn: 'group',
        groupA: 'A',
        groupB: 'B',
      },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.sampleSize.validObservations).toBe(20);

    const num = res.numericResults;
    expect(num.groupA).toBe('A');
    expect(num.groupB).toBe('B');
    expect(num.countA).toBe(10);
    expect(num.countB).toBe(10);
    expect(num.meanA).toBeCloseTo(5.5, 2);
    expect(num.meanB).toBeCloseTo(15.5, 2);
    expect(num.meanDifference).toBeCloseTo(-10.0, 2);
    // Difference is overwhelmingly statistically significant
    expect(num.isSignificant).toBe(true);
    expect(num.pValue).toBeLessThan(0.001);
    expect(Math.abs(num.cohensD)).toBeGreaterThan(2.0); // Large effect size
  });

  it('executes One-Way ANOVA multi-group variance test', async () => {
    const req: PythonAnalysisRequest = {
      taskId: 'stat-anova-1',
      taskType: 'anova',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['y', 'group'],
      parameters: { metricColumn: 'y', groupColumn: 'group' },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.sampleSize.validObservations).toBe(20);

    const a = res.numericResults;
    expect(a.fStatistic).toBeGreaterThan(10.0);
    expect(a.pValue).toBeLessThan(0.001);
    expect(a.isSignificant).toBe(true);
    expect(a.dfBetween).toBe(1);
    expect(a.dfWithin).toBe(18);
  });

  it('performs Chi-Square test of independence', async () => {
    const req: PythonAnalysisRequest = {
      taskId: 'stat-chi2-1',
      taskType: 'chi_square',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['group', 'status'],
      parameters: { column1: 'group', column2: 'status' },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.numericResults.degreesOfFreedom).toBe(1);
    expect(typeof res.numericResults.chi2Statistic).toBe('number');
  });

  it('performs time-series decomposition and rolling moving averages with min observations validation', async () => {
    const req: PythonAnalysisRequest = {
      taskId: 'stat-ts-1',
      taskType: 'time_series',
      datasetId: 'fixture_dataset',
      datasetPath: fixturePath,
      columns: ['date', 'y'],
      parameters: { dateColumn: 'date', valueColumn: 'y', forecastSteps: 3 },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.sampleSize.validObservations).toBe(20);
    expect(res.numericResults.trendDirection).toBe('upward');
    expect(res.numericResults.forecast).toHaveLength(3);
    expect(res.numericResults.forecast[0]).toBeGreaterThan(45); // Extrapolates upward from 45
  });

  describe('Small-Sample Confidence Intervals & Edge Cases (M8 Correction)', () => {
    it('computes exact Student t 95% confidence intervals on small sample (nine-observation example)', async () => {
      const salesReq: PythonAnalysisRequest = {
        taskId: 'stat-desc-small-9',
        taskType: 'descriptive_stats',
        datasetId: 'sample_sales',
        datasetPath: 'datasets/sample_sales.csv',
        columns: ['unit_price'],
        parameters: { column: 'unit_price' },
      };

      const res = await executeSandboxedPython(salesReq);
      expect(res.status).toBe('success');
      // 10 total rows with 1 null unit_price gives exactly 9 valid observations
      expect(res.sampleSize.totalRows).toBe(10);
      expect(res.sampleSize.validObservations).toBe(9);
      expect(res.sampleSize.droppedOrMissing).toBe(1);
      expect(res.sampleSize.degreesOfFreedom).toBe(8);

      const num = res.numericResults;
      expect(num.mean).toBeCloseTo(346.51, 1);
      expect(num.median).toBe(120.0);
      expect(num.standardError).toBeCloseTo(148.53, 1);

      // Student's t critical value for df = 8 is 2.306 (not asymptotic normal 1.96)
      expect(num.ciMethod).toBe('student_t_distribution');
      expect(num.tCritical).toBeCloseTo(2.306, 3);
      expect(num.ci95Lower).toBeCloseTo(4.00, 1);
      expect(num.ci95Upper).toBeCloseTo(689.02, 1);

      // Warnings must flag small sample size with t_crit/df and explicitly warn that CI does not resolve non-normality/outliers
      expect(res.warnings.some((w) => w.includes('Small sample size') && w.includes('t_crit=2.306'))).toBe(true);
      expect(res.warnings.some((w) => w.includes('intervals do not resolve underlying non-normality'))).toBe(true);

      // Assumptions track sample sufficiency and normality
      const sufficiency = res.assumptions.find((a) => a.name === 'Sample Size Sufficiency');
      expect(sufficiency?.satisfied).toBe(false);
    });

    it('handles edge case of insufficient sample size (n=1) deterministically', async () => {
      const singleReq: PythonAnalysisRequest = {
        taskId: 'stat-desc-n1',
        taskType: 'descriptive_stats',
        datasetId: 'single_obs',
        datasetPath: 'tests/fixtures/single_observation_test.csv',
        columns: ['val'],
        parameters: { column: 'val' },
      };

      const res = await executeSandboxedPython(singleReq);
      expect(res.status).toBe('success');
      expect(res.sampleSize.validObservations).toBe(1);
      expect(res.sampleSize.degreesOfFreedom).toBe(0);

      const num = res.numericResults;
      expect(num.mean).toBe(42.5);
      expect(num.stdDev).toBeNull();
      expect(num.variance).toBeNull();
      expect(num.standardError).toBeNull();
      expect(num.ci95Lower).toBeNull();
      expect(num.ci95Upper).toBeNull();
      expect(num.ciMethod).toBe('insufficient_sample_size');
      expect(res.warnings.some((w) => w.includes('insufficient to compute sample variance'))).toBe(true);
    });

    it('handles edge case of zero variance (constant values) deterministically', async () => {
      const zeroVarReq: PythonAnalysisRequest = {
        taskId: 'stat-desc-zero-var',
        taskType: 'descriptive_stats',
        datasetId: 'zero_var',
        datasetPath: 'tests/fixtures/zero_variance_test.csv',
        columns: ['val'],
        parameters: { column: 'val' },
      };

      const res = await executeSandboxedPython(zeroVarReq);
      expect(res.status).toBe('success');
      expect(res.sampleSize.validObservations).toBe(5);

      const num = res.numericResults;
      expect(num.mean).toBe(10.0);
      expect(num.stdDev).toBe(0.0);
      expect(num.variance).toBe(0.0);
      expect(num.standardError).toBe(0.0);
      expect(num.ci95Lower).toBe(10.0);
      expect(num.ci95Upper).toBe(10.0);
      expect(num.ciMethod).toBe('degenerate_zero_variance');
      expect(res.warnings.some((w) => w.includes('Zero variance observed'))).toBe(true);
    });
  });
});
