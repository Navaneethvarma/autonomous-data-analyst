import { describe, it, expect } from 'vitest';
import {
  PythonAnalysisRequestSchema,
  PythonAnalysisResultSchema,
  PythonTaskTypeSchema,
  type PythonAnalysisResult,
} from '../../src/lib/python/types.js';

describe('Python Analytics Contract & Schema Validation (M8)', () => {
  it('validates supported Python task types', () => {
    expect(PythonTaskTypeSchema.safeParse('descriptive_stats').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('group_comparison').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('regression').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('anova').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('chi_square').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('time_series').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('custom_script').success).toBe(true);
    expect(PythonTaskTypeSchema.safeParse('unsupported_task').success).toBe(false);
  });

  it('validates a compliant PythonAnalysisRequest and populates default limits', () => {
    const rawRequest = {
      taskId: 'task-val-1',
      taskType: 'descriptive_stats',
      datasetId: 'dataset-123',
      datasetPath: 'datasets/sample_sales.csv',
      columns: ['unit_price', 'quantity'],
      parameters: { column: 'unit_price' },
    };

    const parsed = PythonAnalysisRequestSchema.safeParse(rawRequest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limits.timeoutMs).toBe(10000);
      expect(parsed.data.limits.maxOutputBytes).toBe(524288);
      expect(parsed.data.limits.maxRows).toBe(50000);
    }
  });

  it('rejects an invalid request missing required fields', () => {
    const invalidRequest = {
      taskId: 'bad-task',
      taskType: 'regression',
      // missing datasetId, datasetPath, columns
    };

    const parsed = PythonAnalysisRequestSchema.safeParse(invalidRequest);
    expect(parsed.success).toBe(false);
  });

  it('validates a structured PythonAnalysisResult schema', () => {
    const compliantResult: PythonAnalysisResult = {
      contractVersion: '1.0.0',
      status: 'success',
      taskType: 'regression',
      interpretation: 'OLS regression shows statistically significant positive relationship.',
      sampleSize: {
        totalRows: 100,
        validObservations: 95,
        droppedOrMissing: 5,
        degreesOfFreedom: 93,
      },
      numericResults: {
        slope: 1.54,
        intercept: 10.2,
        rSquared: 0.82,
        pValue: 0.001,
        isSignificant: true,
      },
      assumptions: [
        {
          name: 'Linearity',
          satisfied: true,
          details: 'Correlation coefficient r=0.91',
        },
      ],
      warnings: [],
      provenance: {
        datasetId: 'dataset-123',
        datasetPath: 'datasets/sample_sales.csv',
        executionTimeMs: 145.2,
        timestamp: new Date().toISOString(),
        pythonVersion: '3.14.2',
        librariesUsed: ['stdlib:math', 'numpy:2.5.4', 'scipy:scipy.stats'],
        workerSandboxType: 'restricted_subprocess_dev',
        isolationLevel: 'development_restricted_subprocess',
      },
    };

    const parsed = PythonAnalysisResultSchema.safeParse(compliantResult);
    expect(parsed.success).toBe(true);
  });

  it('rejects a result with negative sample size observations', () => {
    const invalidResult = {
      contractVersion: '1.0.0',
      status: 'success',
      taskType: 'regression',
      interpretation: 'Test',
      sampleSize: {
        totalRows: -10, // Invalid: cannot be negative
        validObservations: 5,
        droppedOrMissing: 0,
      },
      numericResults: {},
      assumptions: [],
      warnings: [],
      provenance: {
        datasetId: 'test',
        datasetPath: 'test.csv',
        executionTimeMs: 10,
        timestamp: new Date().toISOString(),
        pythonVersion: '3.14.2',
        librariesUsed: [],
        workerSandboxType: 'process_isolated_subprocess',
      },
    };

    const parsed = PythonAnalysisResultSchema.safeParse(invalidResult);
    expect(parsed.success).toBe(false);
  });
});
