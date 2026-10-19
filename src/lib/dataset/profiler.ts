import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse } from 'csv-parse';
import type {
  ColumnProfile,
  DataQualityWarning,
  DatasetProfile,
  InferredDataType,
  NumericStats,
} from './types.js';
import { validateAndResolveDatasetPath } from './validator.js';
import { datasetProfileCache } from './cache.js';

const NULL_INDICATORS = new Set([
  '',
  'null',
  'none',
  'nan',
  'na',
  'n/a',
  '#n/a',
  'undefined',
  '-',
  '?',
]);

const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ISO_DATETIME_REGEX =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const INTEGER_REGEX = /^-?\d+$/;
const FLOAT_REGEX = /^-?\d+\.\d+(?:[eE][+-]?\d+)?$/;

interface ColumnAccumulator {
  name: string;
  totalCount: number;
  nullCount: number;
  distinctValues: Set<string>;
  distinctCapped: boolean;
  valueFrequencies: Map<string, number>;
  numericValues: number[];
  dateValues: number[]; // timestamps for min/max
  typeCounts: {
    integer: number;
    float: number;
    boolean: number;
    date: number;
    datetime: number;
    string: number;
  };
}

export interface ProfilerOptions {
  customBaseDir?: string;
  maxSizeBytes?: number;
  maxDistinctTracked?: number;
  maxNumericSamples?: number;
}

/**
 * Calculates a quantile value from a sorted array of numbers using linear interpolation.
 */
function calculateQuantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  const current = sorted[base];
  const next = sorted[base + 1];

  if (current === undefined) return 0;
  if (next !== undefined) {
    return Number((current + rest * (next - current)).toFixed(4));
  }
  return Number(current.toFixed(4));
}

/**
 * Computes mean, median, standard deviation, and quartiles from collected numeric values.
 */
function computeNumericStats(values: number[]): NumericStats | undefined {
  if (values.length === 0) return undefined;

  let sum = 0;
  let min = values[0]!;
  let max = values[0]!;

  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const mean = sum / values.length;

  // Sample standard deviation (Welford or two-pass)
  let varianceSum = 0;
  for (const v of values) {
    varianceSum += Math.pow(v - mean, 2);
  }
  const variance = values.length > 1 ? varianceSum / (values.length - 1) : 0;
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const sorted = [...values].sort((a, b) => a - b);
  const median = calculateQuantile(sorted, 0.5);
  const p25 = calculateQuantile(sorted, 0.25);
  const p75 = calculateQuantile(sorted, 0.75);

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median,
    stdDev: Number(stdDev.toFixed(4)),
    p25,
    p75,
  };
}

/**
 * Normalizes headers, handles duplicates by appending suffix, and strips BOM.
 */
function processHeaders(rawHeaders: string[]): {
  headers: string[];
  warnings: DataQualityWarning[];
} {
  const warnings: DataQualityWarning[] = [];
  const counts = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < rawHeaders.length; i++) {
    let header = rawHeaders[i]?.trim().replace(/^\uFEFF/, '') || '';
    if (!header) {
      header = `unnamed_column_${i + 1}`;
      warnings.push({
        type: 'general',
        column: header,
        message: `Empty header name at column index ${i + 1} was replaced with '${header}'.`,
      });
    }

    const currentCount = counts.get(header) || 0;
    counts.set(header, currentCount + 1);

    if (currentCount > 0) {
      const disambiguated = `${header}_${currentCount + 1}`;
      warnings.push({
        type: 'duplicate_headers',
        column: disambiguated,
        message: `Duplicate column header '${header}' at index ${i + 1} was disambiguated to '${disambiguated}'.`,
      });
      headers.push(disambiguated);
    } else {
      headers.push(header);
    }
  }

  return { headers, warnings };
}

/**
 * Classifies an individual string value into an empirical type.
 */
function classifyValue(val: string): {
  type: InferredDataType;
  parsedNumber?: number;
  parsedDate?: number;
} {
  const trimmed = val.trim();

  // Boolean
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return { type: 'boolean' };
  }

  // Integer
  if (INTEGER_REGEX.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num) && Number.isSafeInteger(num)) {
      return { type: 'integer', parsedNumber: num };
    }
  }

  // Float
  if (FLOAT_REGEX.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return { type: 'float', parsedNumber: num };
    }
  }

  // Date (ISO format YYYY-MM-DD)
  if (ISO_DATE_REGEX.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts)) {
      return { type: 'date', parsedDate: ts };
    }
  }

  // Datetime (ISO format with time)
  if (ISO_DATETIME_REGEX.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts)) {
      return { type: 'datetime', parsedDate: ts };
    }
  }

  return { type: 'string' };
}

/**
 * Streaming CSV dataset profiler.
 */
export async function profileDataset(
  filePath: string,
  options: ProfilerOptions = {}
): Promise<DatasetProfile> {
  const { resolvedPath, sanitizedName, fileSizeBytes } = validateAndResolveDatasetPath(
    filePath,
    options.customBaseDir,
    options.maxSizeBytes
  );

  const cached = datasetProfileCache.get(resolvedPath);
  if (cached) {
    return cached;
  }

  const maxDistinct = options.maxDistinctTracked ?? 10000;
  const maxNumericSamples = options.maxNumericSamples ?? 100000;

  const qualityWarnings: DataQualityWarning[] = [];
  const rowHashes = new Set<string>();
  let duplicateRowCount = 0;
  let rowCount = 0;
  let headers: string[] = [];
  let accumulators: ColumnAccumulator[] = [];
  let isFirstRow = true;

  const parser = fs.createReadStream(resolvedPath).pipe(
    parse({
      delimiter: ',',
      relax_column_count: true,
      skip_empty_lines: false,
      trim: false,
    })
  );

  for await (const record of parser) {
    const row = record as string[];

    // Process header row
    if (isFirstRow) {
      isFirstRow = false;

      // Handle completely empty header line
      if (row.length === 0 || (row.length === 1 && row[0]?.trim() === '')) {
        qualityWarnings.push({
          type: 'empty_dataset',
          message: 'Dataset header is empty.',
        });
        break;
      }

      const processed = processHeaders(row);
      headers = processed.headers;
      qualityWarnings.push(...processed.warnings);

      accumulators = headers.map(name => ({
        name,
        totalCount: 0,
        nullCount: 0,
        distinctValues: new Set<string>(),
        distinctCapped: false,
        valueFrequencies: new Map<string, number>(),
        numericValues: [],
        dateValues: [],
        typeCounts: {
          integer: 0,
          float: 0,
          boolean: 0,
          date: 0,
          datetime: 0,
          string: 0,
        },
      }));
      continue;
    }

    // Skip empty lines in body
    if (row.length === 0 || (row.length === 1 && row[0]?.trim() === '')) {
      continue;
    }

    rowCount++;

    // Inconsistent column count check
    if (row.length !== headers.length) {
      if (qualityWarnings.filter(w => w.type === 'inconsistent_rows').length < 5) {
        qualityWarnings.push({
          type: 'inconsistent_rows',
          message: `Row ${rowCount + 1} has ${row.length} columns, expected ${headers.length}.`,
        });
      }
    }

    // Duplicate row detection via hash
    const rowString = JSON.stringify(row);
    const hash = crypto.createHash('sha256').update(rowString).digest('base64');
    if (rowHashes.has(hash)) {
      duplicateRowCount++;
    } else {
      rowHashes.add(hash);
    }

    // Accumulate column metrics
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const acc = accumulators[colIdx];
      if (!acc) continue;

      acc.totalCount++;
      const rawVal = row[colIdx];

      // Missing / null check
      if (rawVal === undefined || NULL_INDICATORS.has(rawVal.trim().toLowerCase())) {
        acc.nullCount++;
        continue;
      }

      const trimmedVal = rawVal.trim();

      // Distinct & frequency tracking
      if (!acc.distinctCapped) {
        acc.distinctValues.add(trimmedVal);
        if (acc.distinctValues.size > maxDistinct) {
          acc.distinctCapped = true;
        }
      }

      // Track top frequency counts (keep top 50 in memory)
      const currentFreq = acc.valueFrequencies.get(trimmedVal) || 0;
      acc.valueFrequencies.set(trimmedVal, currentFreq + 1);

      // Classify value type
      const classified = classifyValue(trimmedVal);
      acc.typeCounts[classified.type]++;

      if (
        (classified.type === 'integer' || classified.type === 'float') &&
        classified.parsedNumber !== undefined
      ) {
        if (acc.numericValues.length < maxNumericSamples) {
          acc.numericValues.push(classified.parsedNumber);
        }
      }

      if (
        (classified.type === 'date' || classified.type === 'datetime') &&
        classified.parsedDate !== undefined
      ) {
        acc.dateValues.push(classified.parsedDate);
      }
    }
  }

  // Warnings for empty dataset or duplicate rows
  if (rowCount === 0) {
    qualityWarnings.push({
      type: 'empty_dataset',
      message: 'Dataset contains 0 data rows.',
    });
  }

  if (duplicateRowCount > 0) {
    qualityWarnings.push({
      type: 'duplicate_rows',
      message: `Detected ${duplicateRowCount} duplicate rows in dataset.`,
    });
  }

  // Construct column profiles
  const columns: ColumnProfile[] = accumulators.map(acc => {
    const nonNullCount = acc.totalCount - acc.nullCount;
    const nullPercentage =
      acc.totalCount > 0 ? Number(((acc.nullCount / acc.totalCount) * 100).toFixed(2)) : 0;
    const distinctCount = acc.distinctValues.size;
    const warnings: string[] = [];

    // Infer dominant data type
    let inferredType: InferredDataType = 'string';
    if (nonNullCount === 0) {
      inferredType = 'string';
      warnings.push('All values are null or missing.');
    } else if (acc.typeCounts.string > 0) {
      inferredType = 'string';
    } else if (acc.typeCounts.datetime > 0) {
      inferredType = 'datetime';
    } else if (acc.typeCounts.date > 0 && acc.typeCounts.date === nonNullCount) {
      inferredType = 'date';
    } else if (acc.typeCounts.boolean === nonNullCount) {
      inferredType = 'boolean';
    } else if (acc.typeCounts.float > 0) {
      inferredType = 'float';
    } else if (acc.typeCounts.integer === nonNullCount) {
      inferredType = 'integer';
    }

    // Constant column check
    if (distinctCount === 1 && nonNullCount > 1) {
      warnings.push(`Column '${acc.name}' is constant (contains only 1 distinct value).`);
      qualityWarnings.push({
        type: 'constant_column',
        column: acc.name,
        message: `Column '${acc.name}' contains only 1 distinct value across ${nonNullCount} non-null rows.`,
      });
    }

    // High null percentage check
    if (nullPercentage >= 50) {
      warnings.push(`Column '${acc.name}' has a high missing-value rate of ${nullPercentage}%.`);
      qualityWarnings.push({
        type: 'high_null_percentage',
        column: acc.name,
        message: `Column '${acc.name}' has ${nullPercentage}% missing values.`,
      });
    }

    // Top categorical values (sorted descending by count)
    const sortedFrequencies = Array.from(acc.valueFrequencies.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const profile: ColumnProfile = {
      name: acc.name,
      inferredType,
      totalValues: acc.totalCount,
      nonNullCount,
      nullCount: acc.nullCount,
      nullPercentage,
      distinctCount,
      warnings,
      categoricalStats: {
        topValues: sortedFrequencies,
      },
    };

    // Numeric stats
    if (inferredType === 'integer' || inferredType === 'float') {
      profile.numericStats = computeNumericStats(acc.numericValues);
    }

    // Date stats
    if ((inferredType === 'date' || inferredType === 'datetime') && acc.dateValues.length > 0) {
      let minTs = acc.dateValues[0]!;
      let maxTs = acc.dateValues[0]!;
      for (const ts of acc.dateValues) {
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
      profile.dateStats = {
        minDate: new Date(minTs).toISOString(),
        maxDate: new Date(maxTs).toISOString(),
      };
    }

    return profile;
  });

  const datasetProfile: DatasetProfile = {
    fileName: sanitizedName,
    fileSizeBytes,
    rowCount,
    columnCount: headers.length,
    duplicateRowCount,
    columns,
    warnings: qualityWarnings,
    profiledAt: new Date().toISOString(),
  };

  datasetProfileCache.set(resolvedPath, datasetProfile);
  return datasetProfile;
}
