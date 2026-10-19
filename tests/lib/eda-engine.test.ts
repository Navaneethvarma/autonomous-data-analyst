import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import duckdb from 'duckdb';
import { runAutomatedEda } from '../../src/lib/analytics/eda-engine.js';
import { DatasetEdaSummarySchema } from '../../src/lib/analytics/eda-types.js';

describe('Automated EDA Engine', () => {
  const testBaseDir = path.resolve(process.cwd(), 'tests/fixtures/eda_sandbox');
  const csvFile = 'eda_test.csv';
  const parquetFile = 'eda_test.parquet';
  const edgeCaseCsv = 'eda_edge_cases.csv';
  const emptyCsv = 'eda_empty.csv';

  beforeAll(async () => {
    fs.mkdirSync(testBaseDir, { recursive: true });

    // 1. Standard test dataset with known numbers, dates, categories, nulls, and an outlier
    // x: 10, 20, 30, 40, 50, 60, 70, 80, 500 (outlier) -> 9 values
    // y: 1, 2, 3, 4, 5, 6, 7, 8, 9 -> perfectly positively correlated with x (except outlier)
    const standardContent = [
      'id,event_date,category,metric_x,metric_y,status',
      '1,2026-01-01,Alpha,10,1,active',
      '2,2026-01-02,Alpha,20,2,active',
      '3,2026-01-03,Alpha,30,3,active',
      '4,2026-01-04,Beta,40,4,active',
      '5,2026-01-05,Beta,50,5,active',
      '6,2026-01-06,Beta,60,6,pending',
      '7,2026-01-07,Gamma,70,7,pending',
      '8,2026-01-08,Gamma,80,8,pending',
      '9,2026-01-09,Gamma,500,9,null', // null status, outlier metric_x = 500
    ].join('\n');
    fs.writeFileSync(path.join(testBaseDir, csvFile), standardContent, 'utf-8');

    // 2. Parquet conversion of standard dataset
    await new Promise<void>((resolve, reject) => {
      const db = new duckdb.Database(':memory:');
      const normCsv = path.join(testBaseDir, csvFile).replace(/\\/g, '/');
      const normParquet = path.join(testBaseDir, parquetFile).replace(/\\/g, '/');
      db.all(
        `COPY (SELECT * FROM read_csv_auto('${normCsv}', header=true, nullstr=['null', ''])) TO '${normParquet}' (FORMAT PARQUET);`,
        (err) => {
          if (err) db.close(() => reject(err));
          else db.close(() => resolve());
        }
      );
    });

    // 3. Edge-case dataset: constant columns, 100% null column, small sample size (3 rows)
    const edgeContent = [
      'id,const_num,const_str,all_null,skewed_val',
      '1,100,fixed,null,1',
      '2,100,fixed,null,2',
      '3,100,fixed,null,100',
    ].join('\n');
    fs.writeFileSync(path.join(testBaseDir, edgeCaseCsv), edgeContent, 'utf-8');

    // 4. Completely empty dataset (headers only, 0 data rows)
    const emptyContent = 'col_a,col_b,col_c\n';
    fs.writeFileSync(path.join(testBaseDir, emptyCsv), emptyContent, 'utf-8');
  }, 30000);

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore transient Windows EBUSY
    }
  });

  it('computes accurate numeric distributions, quartiles, and IQR outlier detection', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: csvFile },
      { customBaseDir: testBaseDir }
    );

    // Validate against Zod schema
    expect(() => DatasetEdaSummarySchema.parse(eda)).not.toThrow();
    expect(eda.rowCount).toBe(9);
    expect(eda.columnCount).toBe(6);

    const metricX = eda.numericDistributions.find(d => d.column === 'metric_x');
    expect(metricX).toBeDefined();
    expect(metricX?.count).toBe(9);
    expect(metricX?.min).toBe(10);
    expect(metricX?.max).toBe(500);
    expect(metricX?.median).toBe(50);
    // IQR: p25=30, p75=70 -> IQR = 40. Upper bound = 70 + 1.5*40 = 130
    expect(metricX?.p25).toBe(30);
    expect(metricX?.p75).toBe(70);
    expect(metricX?.iqr).toBe(40);
    expect(metricX?.outlierBounds.upperBound).toBe(130);
    expect(metricX?.outlierCount).toBe(1); // 500 is > 130
    expect(metricX?.outlierPercentage).toBeCloseTo(11.11, 1);
    expect(metricX?.isConstant).toBe(false);
  });

  it('computes categorical cardinality, mode, and concentration percentage', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: csvFile },
      { customBaseDir: testBaseDir }
    );

    const cat = eda.categoricalDistributions.find(d => d.column === 'category');
    expect(cat).toBeDefined();
    expect(cat?.distinctCount).toBe(3); // Alpha, Beta, Gamma
    expect(cat?.totalCount).toBe(9);
    expect(cat?.concentrationPercentage).toBeCloseTo(33.33, 1);
    expect(cat?.isConstant).toBe(false);
    expect(cat?.topValues.length).toBe(3);
  });

  it('calculates pairwise Pearson correlation with causation caveat', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: csvFile, includeCorrelations: true },
      { customBaseDir: testBaseDir }
    );

    const corr = eda.correlations.find(
      c => (c.columnA === 'metric_x' && c.columnB === 'metric_y') ||
           (c.columnA === 'metric_y' && c.columnB === 'metric_x')
    );
    expect(corr).toBeDefined();
    expect(corr?.sampleSize).toBe(9);
    expect(corr?.pearsonCoefficient).toBeGreaterThan(0.5); // Positive correlation
    expect(corr?.causationCaveat).toContain('does NOT demonstrate or imply causation');
  });

  it('analyzes temporal trends along date column', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: csvFile },
      { customBaseDir: testBaseDir }
    );

    expect(eda.temporalAnalyses.length).toBeGreaterThan(0);
    const temp = eda.temporalAnalyses[0]!;
    expect(temp.dateColumn).toBe('event_date');
    expect(temp.minDate).toBe('2026-01-01');
    expect(temp.maxDate).toBe('2026-01-09');
    expect(temp.rangeDays).toBe(8);
    expect(temp.periodType).toBe('daily');
    expect(temp.dataPoints.length).toBe(9);
  });

  it('supports Parquet datasets natively', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: parquetFile },
      { customBaseDir: testBaseDir }
    );

    expect(eda.rowCount).toBe(9);
    expect(eda.numericDistributions.length).toBeGreaterThan(0);
    expect(eda.datasetName).toBe(parquetFile);
  });

  it('handles edge cases safely: constant columns, 100% null columns, small sample size', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: edgeCaseCsv },
      { customBaseDir: testBaseDir }
    );

    expect(eda.rowCount).toBe(3);

    // Constant column checks
    const constNum = eda.numericDistributions.find(d => d.column === 'const_num');
    expect(constNum?.isConstant).toBe(true);

    const constStr = eda.categoricalDistributions.find(d => d.column === 'const_str');
    expect(constStr?.isConstant).toBe(true);
    expect(constStr?.distinctCount).toBe(1);

    // 100% null column checks
    const allNull = eda.categoricalDistributions.find(d => d.column === 'all_null');
    expect(allNull?.nullPercentage).toBe(100);

    // Quality warnings generated
    const qualityTypes = eda.qualityIssues.map(q => q.type);
    expect(qualityTypes).toContain('small_sample_size');
    expect(qualityTypes).toContain('constant_column');
    expect(qualityTypes).toContain('complete_missingness');
  });

  it('handles completely empty datasets (0 rows) gracefully without errors', async () => {
    const eda = await runAutomatedEda(
      { datasetPath: emptyCsv },
      { customBaseDir: testBaseDir }
    );

    expect(eda.rowCount).toBe(0);
    expect(eda.completenessScore).toBe(0);
    expect(eda.numericDistributions).toEqual([]);
    expect(eda.qualityIssues.some(q => q.type === 'empty_dataset')).toBe(true);
  });
});
