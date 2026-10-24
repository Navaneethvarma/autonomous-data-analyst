import duckdb from 'duckdb';
import path from 'node:path';
import { validateAndResolveDatasetPath } from '../dataset/validator.js';
import {
  type DatasetEdaSummary,
  type DataQualityIssue,
  type RunAutomatedEdaInput,
  RunAutomatedEdaInputSchema,
} from './eda-types.js';
import {
  type DuckDbColumnInfo,
  classifyType,
  escapeIdent,
  profileNumericColumns,
  profileCategoricalColumns,
  profileTemporalColumns,
  computePairwiseCorrelations,
} from './eda-profilers.js';

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
    const numericDistributions = await profileNumericColumns(
      runAll,
      rawColumns,
      columnTypes,
      rowCount,
      qualityIssues
    );

    // 6. Categorical distributions & Cardinality
    const categoricalDistributions = await profileCategoricalColumns(
      runAll,
      rawColumns,
      columnTypes,
      rowCount,
      qualityIssues
    );

    // 7. Temporal Trend & Period Analysis
    const numericColNames = rawColumns.filter(c => columnTypes[c.name] === 'numeric').map(c => c.name);
    const temporalAnalyses = await profileTemporalColumns(
      runAll,
      rawColumns,
      columnTypes,
      numericColNames,
      parsedInput.temporalMetricColumn
    );

    // 8. Pairwise Correlations
    let correlations: any[] = [];
    if (parsedInput.includeCorrelations !== false && numericDistributions.length >= 2) {
      correlations = await computePairwiseCorrelations(runAll, numericDistributions);
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
