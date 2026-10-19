import duckdb from 'duckdb';
import path from 'node:path';
import { validateAndResolveDatasetPath } from '../dataset/validator.js';
import {
  type DatasetEdaSummary,
  type NumericDistribution,
  type CategoricalDistribution,
  type CorrelationResult,
  type TemporalAnalysis,
  type DataQualityIssue,
  type RunAutomatedEdaInput,
  RunAutomatedEdaInputSchema,
} from './eda-types.js';

interface DuckDbColumnInfo {
  name: string;
  type: string;
  nullCount: number;
}

/**
 * Normalizes number values, converting NaN or infinite values to null.
 */
function cleanNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    if (Number.isNaN(val) || !Number.isFinite(val)) return null;
    return Number(val.toFixed(4));
  }
  if (typeof val === 'bigint') {
    return Number(val);
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return Number(num.toFixed(4));
    }
  }
  return null;
}

/**
 * Classifies DuckDB column type string into simplified analytical domain category.
 */
function classifyType(typeStr: string): 'numeric' | 'temporal' | 'categorical' {
  const upper = typeStr.toUpperCase();
  if (
    upper.includes('INT') ||
    upper.includes('DOUBLE') ||
    upper.includes('FLOAT') ||
    upper.includes('DECIMAL') ||
    upper.includes('REAL') ||
    upper.includes('NUMERIC')
  ) {
    return 'numeric';
  }
  if (
    upper.includes('DATE') ||
    upper.includes('TIMESTAMP') ||
    upper.includes('TIME')
  ) {
    return 'temporal';
  }
  return 'categorical';
}

/**
 * Escapes SQL identifier for safe DuckDB querying.
 */
function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Executes Automated Exploratory Data Analysis over the full dataset using DuckDB.
 */
export async function runAutomatedEda(
  input: RunAutomatedEdaInput,
  options: { customBaseDir?: string } = {}
): Promise<DatasetEdaSummary> {
  const startTime = Date.now();
  const parsedInput = RunAutomatedEdaInputSchema.parse(input);

  const { resolvedPath, sanitizedName } = validateAndResolveDatasetPath(
    parsedInput.datasetPath,
    options.customBaseDir
  );

  const db = new duckdb.Database(':memory:', {
    max_memory: '512MB',
  });

  const runAll = (sql: string, params: unknown[] = []): Promise<duckdb.TableData> => {
    return new Promise((resolve, reject) => {
      if (params.length > 0) {
        db.all(sql, ...params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        db.all(sql, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }
    });
  };

  try {
    // 1. Load dataset into in-memory table
    const normalizedDbPath = resolvedPath.replace(/\\/g, '/');
    const ext = path.extname(resolvedPath).toLowerCase();

    const loaderSql = ext === '.parquet'
      ? `CREATE TABLE dataset AS SELECT * FROM read_parquet('${normalizedDbPath}');`
      : `CREATE TABLE dataset AS SELECT * FROM read_csv_auto('${normalizedDbPath}', header=true, nullstr=['null', 'NULL', 'NaN', 'NA', 'n/a', 'N/A', 'None', 'none', '']);`;

    await runAll(loaderSql);

    // 2. Lock down external access
    await runAll('SET enable_external_access = false;');

    // 3. Inspect table metadata & row count
    const countRes = await runAll('SELECT COUNT(*) as total_rows FROM dataset;');
    const rowCount = Number((countRes[0] as { total_rows: bigint | number })?.total_rows ?? 0);

    const schemaRes = await runAll('DESCRIBE dataset;');
    const rawColumns: DuckDbColumnInfo[] = schemaRes.map((col: any) => ({
      name: String(col.column_name),
      type: String(col.column_type),
      nullCount: 0,
    }));

    const columnCount = rawColumns.length;
    const qualityIssues: DataQualityIssue[] = [];

    // Empty dataset handling
    if (rowCount === 0) {
      qualityIssues.push({
        type: 'empty_dataset',
        severity: 'critical',
        message: `Dataset '${sanitizedName}' contains 0 rows. Unable to perform statistical distributions.`,
      });

      return {
        datasetName: sanitizedName,
        rowCount: 0,
        columnCount,
        completenessScore: 0,
        numericDistributions: [],
        categoricalDistributions: [],
        temporalAnalyses: [],
        correlations: [],
        qualityIssues,
        analyzedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (rowCount < 5) {
      qualityIssues.push({
        type: 'small_sample_size',
        severity: 'warning',
        message: `Small sample size (${rowCount} rows). Statistical metrics (std dev, skewness, correlations) have low statistical power.`,
        metricValue: rowCount,
      });
    }

    // 4. Compute column missingness and classify types
    let totalCells = rowCount * columnCount;
    let nonNullCellsTotal = 0;

    const columnTypes: Record<string, 'numeric' | 'temporal' | 'categorical'> = {};

    for (const col of rawColumns) {
      const nullCheckRes = await runAll(
        `SELECT COUNT(*) as total, COUNT(${escapeIdent(col.name)}) as non_null FROM dataset;`
      );
      const total = Number((nullCheckRes[0] as any)?.total ?? 0);
      const nonNull = Number((nullCheckRes[0] as any)?.non_null ?? 0);
      col.nullCount = total - nonNull;
      nonNullCellsTotal += nonNull;

      let category = classifyType(col.type);

      // If VARCHAR/TEXT, check if values conform to ISO date format
      if (category === 'categorical' && nonNull > 0) {
        try {
          const dateCheckRes = await runAll(`
            SELECT COUNT(*) as parsed_dates
            FROM dataset
            WHERE ${escapeIdent(col.name)} IS NOT NULL
              AND TRY_CAST(${escapeIdent(col.name)} AS TIMESTAMP) IS NOT NULL;
          `);
          const parsedDates = Number((dateCheckRes[0] as any)?.parsed_dates ?? 0);
          if (parsedDates === nonNull && parsedDates >= 2) {
            category = 'temporal';
          }
        } catch {
          // Keep categorical if try_cast not available or fails
        }
      }

      columnTypes[col.name] = category;

      const nullPct = (col.nullCount / rowCount) * 100;
      if (col.nullCount === rowCount) {
        qualityIssues.push({
          type: 'complete_missingness',
          severity: 'critical',
          column: col.name,
          message: `Column '${col.name}' is completely empty (100% missing values).`,
          metricValue: 100,
        });
      } else if (nullPct >= 30) {
        qualityIssues.push({
          type: 'high_missingness',
          severity: 'warning',
          column: col.name,
          message: `Column '${col.name}' exhibits high missingness: ${nullPct.toFixed(1)}% missing.`,
          metricValue: Number(nullPct.toFixed(2)),
        });
      }
    }

    const completenessScore = totalCells > 0 ? Number(((nonNullCellsTotal / totalCells) * 100).toFixed(2)) : 0;

    // 5. Numeric distributions & Outlier detection
    const numericDistributions: NumericDistribution[] = [];
    const numericColNames = rawColumns.filter(c => columnTypes[c.name] === 'numeric').map(c => c.name);

    for (const colName of numericColNames) {
      const col = rawColumns.find(c => c.name === colName)!;
      const nonNullCount = rowCount - col.nullCount;
      const nullPct = Number(((col.nullCount / rowCount) * 100).toFixed(2));

      if (nonNullCount === 0) {
        numericDistributions.push({
          column: colName,
          count: 0,
          nullCount: col.nullCount,
          nullPercentage: nullPct,
          min: null,
          max: null,
          mean: null,
          median: null,
          stdDev: null,
          variance: null,
          p25: null,
          p75: null,
          iqr: null,
          skewness: null,
          kurtosis: null,
          isConstant: false,
          outlierCount: 0,
          outlierPercentage: 0,
          outlierBounds: { lowerBound: null, upperBound: null },
        });
        continue;
      }

      const statsSql = `
        SELECT 
          MIN(${escapeIdent(colName)}) as min_val,
          MAX(${escapeIdent(colName)}) as max_val,
          AVG(${escapeIdent(colName)}) as avg_val,
          MEDIAN(${escapeIdent(colName)}) as med_val,
          STDDEV_SAMP(${escapeIdent(colName)}) as std_val,
          VAR_SAMP(${escapeIdent(colName)}) as var_val,
          QUANTILE_CONT(${escapeIdent(colName)}, 0.25) as p25_val,
          QUANTILE_CONT(${escapeIdent(colName)}, 0.75) as p75_val,
          SKEWNESS(${escapeIdent(colName)}) as skew_val,
          KURTOSIS(${escapeIdent(colName)}) as kurt_val
        FROM dataset
        WHERE ${escapeIdent(colName)} IS NOT NULL;
      `;

      const statsRes = await runAll(statsSql);
      const row = (statsRes[0] || {}) as any;

      const minVal = cleanNumber(row.min_val);
      const maxVal = cleanNumber(row.max_val);
      const meanVal = cleanNumber(row.avg_val);
      const medVal = cleanNumber(row.med_val);
      const stdVal = cleanNumber(row.std_val);
      const varVal = cleanNumber(row.var_val);
      const p25Val = cleanNumber(row.p25_val);
      const p75Val = cleanNumber(row.p75_val);
      const skewVal = cleanNumber(row.skew_val);
      const kurtVal = cleanNumber(row.kurt_val);

      const isConstant = (minVal !== null && maxVal !== null && minVal === maxVal) || (stdVal === 0);
      if (isConstant) {
        qualityIssues.push({
          type: 'constant_column',
          severity: 'warning',
          column: colName,
          message: `Numeric column '${colName}' is constant (zero variance, value: ${minVal}).`,
          metricValue: minVal ?? 0,
        });
      }

      // Outlier calculation via IQR rule
      let outlierCount = 0;
      let outlierPercentage = 0;
      let lowerBound: number | null = null;
      let upperBound: number | null = null;

      let iqrVal: number | null = null;
      if (p25Val !== null && p75Val !== null) {
        iqrVal = Number((p75Val - p25Val).toFixed(4));
        if (iqrVal > 0 && nonNullCount >= 4) {
          lowerBound = Number((p25Val - 1.5 * iqrVal).toFixed(4));
          upperBound = Number((p75Val + 1.5 * iqrVal).toFixed(4));

          const outlierRes = await runAll(`
            SELECT COUNT(*) as outliers
            FROM dataset
            WHERE ${escapeIdent(colName)} IS NOT NULL
              AND (${escapeIdent(colName)} < ${lowerBound} OR ${escapeIdent(colName)} > ${upperBound});
          `);
          outlierCount = Number((outlierRes[0] as any)?.outliers ?? 0);
          outlierPercentage = Number(((outlierCount / nonNullCount) * 100).toFixed(2));

          if (outlierPercentage >= 5) {
            qualityIssues.push({
              type: 'heavy_outliers',
              severity: 'info',
              column: colName,
              message: `Column '${colName}' exhibits ${outlierCount} outliers (${outlierPercentage}% of values outside [${lowerBound}, ${upperBound}]).`,
              metricValue: outlierPercentage,
            });
          }
        }
      }

      if (skewVal !== null && Math.abs(skewVal) >= 1.5) {
        qualityIssues.push({
          type: 'severe_skewness',
          severity: 'info',
          column: colName,
          message: `Column '${colName}' has severe skewness (${skewVal > 0 ? 'right-skewed' : 'left-skewed'}, g1 = ${skewVal.toFixed(2)}).`,
          metricValue: skewVal,
        });
      }

      numericDistributions.push({
        column: colName,
        count: nonNullCount,
        nullCount: col.nullCount,
        nullPercentage: nullPct,
        min: minVal,
        max: maxVal,
        mean: meanVal,
        median: medVal,
        stdDev: stdVal,
        variance: varVal,
        p25: p25Val,
        p75: p75Val,
        iqr: iqrVal,
        skewness: skewVal,
        kurtosis: kurtVal,
        isConstant,
        outlierCount,
        outlierPercentage,
        outlierBounds: { lowerBound, upperBound },
      });
    }

    // 6. Categorical distributions & Cardinality
    const categoricalDistributions: CategoricalDistribution[] = [];
    const catColNames = rawColumns.filter(c => columnTypes[c.name] === 'categorical').map(c => c.name);

    for (const colName of catColNames) {
      const col = rawColumns.find(c => c.name === colName)!;
      const nonNullCount = rowCount - col.nullCount;
      const nullPct = Number(((col.nullCount / rowCount) * 100).toFixed(2));

      if (nonNullCount === 0) {
        categoricalDistributions.push({
          column: colName,
          totalCount: 0,
          nullCount: col.nullCount,
          nullPercentage: nullPct,
          distinctCount: 0,
          uniqueRatio: 0,
          isConstant: false,
          isHighCardinality: false,
          mode: null,
          modeCount: null,
          topValues: [],
          concentrationPercentage: null,
        });
        continue;
      }

      const distRes = await runAll(`
        SELECT COUNT(DISTINCT ${escapeIdent(colName)}) as distinct_count
        FROM dataset
        WHERE ${escapeIdent(colName)} IS NOT NULL;
      `);
      const distinctCount = Number((distRes[0] as any)?.distinct_count ?? 0);
      const uniqueRatio = Number((distinctCount / nonNullCount).toFixed(4));
      const isConstant = distinctCount === 1;
      const isHighCardinality = distinctCount > 100 && uniqueRatio > 0.8;

      if (isConstant) {
        qualityIssues.push({
          type: 'constant_column',
          severity: 'warning',
          column: colName,
          message: `Categorical column '${colName}' contains only 1 unique value across all records.`,
          metricValue: 1,
        });
      }

      if (isHighCardinality) {
        qualityIssues.push({
          type: 'high_cardinality',
          severity: 'info',
          column: colName,
          message: `Column '${colName}' has high cardinality (${distinctCount} distinct values, ${(uniqueRatio * 100).toFixed(1)}% unique ratio), likely an ID or key column.`,
          metricValue: distinctCount,
        });
      }

      // Top 10 frequent values
      const topRes = await runAll(`
        SELECT 
          CAST(${escapeIdent(colName)} AS VARCHAR) as val,
          COUNT(*) as cnt
        FROM dataset
        WHERE ${escapeIdent(colName)} IS NOT NULL
        GROUP BY val
        ORDER BY cnt DESC, val ASC
        LIMIT 10;
      `);

      const topValues = topRes.map((r: any) => ({
        value: String(r.val ?? 'null'),
        count: Number(r.cnt ?? 0),
        percentage: Number(((Number(r.cnt ?? 0) / nonNullCount) * 100).toFixed(2)),
      }));

      const mode = topValues.length > 0 ? topValues[0]?.value ?? null : null;
      const modeCount = topValues.length > 0 ? topValues[0]?.count ?? null : null;
      const concentrationPercentage = topValues.length > 0 ? topValues[0]?.percentage ?? null : null;

      categoricalDistributions.push({
        column: colName,
        totalCount: nonNullCount,
        nullCount: col.nullCount,
        nullPercentage: nullPct,
        distinctCount,
        uniqueRatio,
        isConstant,
        isHighCardinality,
        mode,
        modeCount,
        topValues,
        concentrationPercentage,
      });
    }

    // 7. Temporal Trend & Period Analysis
    const temporalAnalyses: TemporalAnalysis[] = [];
    const temporalColNames = rawColumns.filter(c => columnTypes[c.name] === 'temporal').map(c => c.name);

    for (const dateCol of temporalColNames) {
      try {
        const rangeRes = await runAll(`
          SELECT 
            MIN(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)) as min_d,
            MAX(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)) as max_d,
            DATEDIFF('day', MIN(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)), MAX(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP))) as diff_days,
            COUNT(*) as total_records
          FROM dataset
          WHERE TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP) IS NOT NULL;
        `);

        const r = (rangeRes[0] || {}) as any;
        const minDateStr = r.min_d ? new Date(r.min_d).toISOString().slice(0, 10) : '';
        const maxDateStr = r.max_d ? new Date(r.max_d).toISOString().slice(0, 10) : '';
        const rangeDays = Number(r.diff_days ?? 0);
        const totalRecords = Number(r.total_records ?? 0);

        if (!minDateStr || !maxDateStr || totalRecords < 2) {
          temporalAnalyses.push({
            dateColumn: dateCol,
            minDate: minDateStr || 'unknown',
            maxDate: maxDateStr || 'unknown',
            rangeDays,
            totalRecords,
            periodType: 'daily',
            trendDirection: 'insufficient_data',
            growthRatePercentage: null,
            dataPoints: [],
            anomalousPeriods: [],
          });
          continue;
        }

        // Granularity selection
        const periodType: 'daily' | 'weekly' | 'monthly' =
          rangeDays <= 31 ? 'daily' : rangeDays <= 180 ? 'weekly' : 'monthly';

        const periodExpr =
          periodType === 'daily'
            ? `STRFTIME(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP), '%Y-%m-%d')`
            : periodType === 'weekly'
            ? `STRFTIME(DATE_TRUNC('week', TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)), '%Y-%m-%d')`
            : `STRFTIME(DATE_TRUNC('month', TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)), '%Y-%m')`;

        // Check for numeric metric column to sum (e.g. quantity or sales/price)
        const metricCol = parsedInput.temporalMetricColumn || numericColNames[0];
        const metricSelect = metricCol ? `, SUM(${escapeIdent(metricCol)}) as metric_sum` : '';

        const pointsRes = await runAll(`
          SELECT 
            ${periodExpr} as period,
            COUNT(*) as count
            ${metricSelect}
          FROM dataset
          WHERE TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP) IS NOT NULL
          GROUP BY period
          ORDER BY period ASC;
        `);

        const dataPoints = pointsRes.map((p: any) => ({
          period: String(p.period),
          count: Number(p.count),
          metricSum: p.metric_sum !== undefined && p.metric_sum !== null ? cleanNumber(p.metric_sum) ?? undefined : undefined,
        }));

        // Evaluate trend direction
        let trendDirection: 'increasing' | 'decreasing' | 'flat' | 'volatile' | 'insufficient_data' = 'insufficient_data';
        let growthRatePercentage: number | null = null;
        const anomalousPeriods: string[] = [];

        if (dataPoints.length >= 2) {
          const firstVal = dataPoints[0]?.metricSum ?? dataPoints[0]!.count;
          const lastVal = dataPoints[dataPoints.length - 1]?.metricSum ?? dataPoints[dataPoints.length - 1]!.count;

          if (firstVal > 0) {
            growthRatePercentage = Number((((lastVal - firstVal) / firstVal) * 100).toFixed(2));
            if (growthRatePercentage > 15) {
              trendDirection = 'increasing';
            } else if (growthRatePercentage < -15) {
              trendDirection = 'decreasing';
            } else {
              trendDirection = 'flat';
            }
          } else {
            trendDirection = lastVal > 0 ? 'increasing' : 'flat';
          }

          // Anomaly detection in time-series points (values > mean + 2*std)
          const counts = dataPoints.map(p => p.metricSum ?? p.count);
          const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
          const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
          const std = Math.sqrt(variance);

          if (std > 0) {
            for (let i = 0; i < dataPoints.length; i++) {
              const val = counts[i]!;
              if (Math.abs(val - mean) >= 2 * std) {
                anomalousPeriods.push(dataPoints[i]!.period);
              }
            }
          }
        }

        temporalAnalyses.push({
          dateColumn: dateCol,
          minDate: minDateStr,
          maxDate: maxDateStr,
          rangeDays,
          totalRecords,
          periodType,
          trendDirection,
          growthRatePercentage,
          dataPoints,
          anomalousPeriods,
        });
      } catch {
        // Fallback if temporal conversion failed
      }
    }

    // 8. Pairwise Correlations
    const correlations: CorrelationResult[] = [];
    const shouldIncludeCorrelations = parsedInput.includeCorrelations !== false;
    if (shouldIncludeCorrelations && numericDistributions.length >= 2) {
      // Exclude constant columns
      const activeNumericCols = numericDistributions.filter(d => !d.isConstant && (d.count >= 4)).map(d => d.column);

      for (let i = 0; i < activeNumericCols.length; i++) {
        for (let j = i + 1; j < activeNumericCols.length; j++) {
          const colA = activeNumericCols[i]!;
          const colB = activeNumericCols[j]!;

          const corrRes = await runAll(`
            SELECT 
              COUNT(*) as sample_size,
              CORR(${escapeIdent(colA)}, ${escapeIdent(colB)}) as r_val
            FROM dataset
            WHERE ${escapeIdent(colA)} IS NOT NULL AND ${escapeIdent(colB)} IS NOT NULL;
          `);

          const sampleSize = Number((corrRes[0] as any)?.sample_size ?? 0);
          const rVal = cleanNumber((corrRes[0] as any)?.r_val);

          if (rVal !== null && sampleSize >= 4) {
            let strength: CorrelationResult['strength'] = 'neutral';
            if (rVal >= 0.7) strength = 'strong_positive';
            else if (rVal >= 0.4) strength = 'moderate_positive';
            else if (rVal > 0.1) strength = 'weak_positive';
            else if (rVal <= -0.7) strength = 'strong_negative';
            else if (rVal <= -0.4) strength = 'moderate_negative';
            else if (rVal < -0.1) strength = 'weak_negative';

            correlations.push({
              columnA: colA,
              columnB: colB,
              sampleSize,
              pearsonCoefficient: rVal,
              strength,
              causationCaveat: `Correlation coefficient of ${rVal} indicates statistical association between '${colA}' and '${colB}', but does NOT demonstrate or imply causation.`,
            });
          }
        }
      }
    }

    return {
      datasetName: sanitizedName,
      rowCount,
      columnCount,
      completenessScore,
      numericDistributions,
      categoricalDistributions,
      temporalAnalyses,
      correlations,
      qualityIssues,
      analyzedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    };
  } finally {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 1000);
      db.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
