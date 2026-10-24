import type {
  NumericDistribution,
  CategoricalDistribution,
  TemporalAnalysis,
  CorrelationResult,
  DataQualityIssue,
} from './eda-types.js';
import {
  type DuckDbColumnInfo,
  type DbRunner,
  cleanNumber,
  classifyType,
  escapeIdent,
} from './eda-helpers.js';

export type { DuckDbColumnInfo, DbRunner };
export { cleanNumber, classifyType, escapeIdent };

/**
 * Profiles numeric columns, calculating central tendencies, moments, and Tukey IQR outliers.
 */
export async function profileNumericColumns(
  runAll: DbRunner,
  rawColumns: DuckDbColumnInfo[],
  columnTypes: Record<string, 'numeric' | 'temporal' | 'categorical'>,
  rowCount: number,
  qualityIssues: DataQualityIssue[]
): Promise<NumericDistribution[]> {
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

    // Outlier calculation via Tukey IQR rule
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

  return numericDistributions;
}

/**
 * Profiles categorical columns, determining distinct counts, modes, and cardinality flags.
 */
export async function profileCategoricalColumns(
  runAll: DbRunner,
  rawColumns: DuckDbColumnInfo[],
  columnTypes: Record<string, 'numeric' | 'temporal' | 'categorical'>,
  rowCount: number,
  qualityIssues: DataQualityIssue[]
): Promise<CategoricalDistribution[]> {
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

  return categoricalDistributions;
}

/**
 * Profiles temporal columns, detecting date ranges, bucketing intervals, and trend/anomaly patterns.
 */
export async function profileTemporalColumns(
  runAll: DbRunner,
  rawColumns: DuckDbColumnInfo[],
  columnTypes: Record<string, 'numeric' | 'temporal' | 'categorical'>,
  numericColNames: string[],
  temporalMetricColumn?: string
): Promise<TemporalAnalysis[]> {
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

      const periodType: 'daily' | 'weekly' | 'monthly' =
        rangeDays <= 31 ? 'daily' : rangeDays <= 180 ? 'weekly' : 'monthly';

      const periodExpr =
        periodType === 'daily'
          ? `STRFTIME(TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP), '%Y-%m-%d')`
          : periodType === 'weekly'
          ? `STRFTIME(DATE_TRUNC('week', TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)), '%Y-%m-%d')`
          : `STRFTIME(DATE_TRUNC('month', TRY_CAST(${escapeIdent(dateCol)} AS TIMESTAMP)), '%Y-%m')`;

      const metricCol = temporalMetricColumn || numericColNames[0];
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
      // Fallback
    }
  }

  return temporalAnalyses;
}

/**
 * Computes pairwise Pearson correlations across valid numeric columns.
 */
export async function computePairwiseCorrelations(
  runAll: DbRunner,
  numericDistributions: NumericDistribution[]
): Promise<CorrelationResult[]> {
  const correlations: CorrelationResult[] = [];
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

  return correlations;
}
