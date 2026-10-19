import fs from 'node:fs';
import { parse } from 'csv-parse';
import { validateAndResolveDatasetPath } from './validator.js';

export class InvalidColumnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidColumnError';
  }
}

export type PreviewMode = 'head' | 'tail' | 'sample';

export interface PreviewDatasetOptions {
  customBaseDir?: string;
  mode?: PreviewMode;
  limit?: number;
  columns?: string[];
}

export interface PreviewDatasetResult {
  fileName: string;
  totalRows: number;
  previewCount: number;
  mode: PreviewMode;
  columns: string[];
  rows: Record<string, string | null>[];
}

/**
 * Safely previews a bounded subset of CSV records (head, tail, or uniform sample)
 * with optional column projection, schema validation, and memory caps.
 */
export async function previewDataset(
  filePath: string,
  options: PreviewDatasetOptions = {}
): Promise<PreviewDatasetResult> {
  const { resolvedPath, sanitizedName } = validateAndResolveDatasetPath(
    filePath,
    options.customBaseDir
  );

  const mode: PreviewMode = options.mode ?? 'head';
  // Strict clamp: minimum 1, maximum 100
  const limit = Math.max(1, Math.min(100, options.limit ?? 10));
  const requestedColumns = options.columns;

  let headers: string[] = [];
  let isFirstRow = true;
  let totalDataRows = 0;

  // Storage depending on mode
  const headRows: string[][] = [];
  const tailBuffer: string[][] = [];
  const sampleReservoir: string[][] = [];

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

    if (isFirstRow) {
      isFirstRow = false;
      headers = row.map((h, i) => h.trim().replace(/^\uFEFF/, '') || `unnamed_column_${i + 1}`);

      // Validate requested columns against actual header schema
      if (requestedColumns && requestedColumns.length > 0) {
        const headerSet = new Set(headers);
        const missing = requestedColumns.filter(c => !headerSet.has(c));
        if (missing.length > 0) {
          throw new InvalidColumnError(
            `Requested column(s) [${missing.map(c => `'${c}'`).join(', ')}] do not exist in dataset '${sanitizedName}'. ` +
            `Available columns: [${headers.map(c => `'${c}'`).join(', ')}]`
          );
        }
      }
      continue;
    }

    // Skip empty lines in data body
    if (row.length === 0 || (row.length === 1 && row[0]?.trim() === '')) {
      continue;
    }

    totalDataRows++;

    if (mode === 'head') {
      if (headRows.length < limit) {
        headRows.push(row);
      }
    } else if (mode === 'tail') {
      tailBuffer.push(row);
      if (tailBuffer.length > limit) {
        tailBuffer.shift();
      }
    } else if (mode === 'sample') {
      // Reservoir sampling (Algorithm R)
      if (sampleReservoir.length < limit) {
        sampleReservoir.push(row);
      } else {
        const j = Math.floor(Math.random() * totalDataRows);
        if (j < limit) {
          sampleReservoir[j] = row;
        }
      }
    }
  }

  // Determine selected rows
  let selectedRows: string[][] = [];
  if (mode === 'head') {
    selectedRows = headRows;
  } else if (mode === 'tail') {
    selectedRows = tailBuffer;
  } else {
    selectedRows = sampleReservoir;
  }

  // Determine active columns
  const activeColumns = requestedColumns && requestedColumns.length > 0
    ? requestedColumns
    : headers;

  const colIndices = activeColumns.map(c => headers.indexOf(c));

  // Map to structured record objects
  const projectedRows: Record<string, string | null>[] = selectedRows.map(row => {
    const obj: Record<string, string | null> = {};
    for (let i = 0; i < activeColumns.length; i++) {
      const colName = activeColumns[i]!;
      const colIdx = colIndices[i]!;
      const val = colIdx >= 0 ? row[colIdx] : undefined;
      obj[colName] = val !== undefined && val.trim() !== '' ? val.trim() : null;
    }
    return obj;
  });

  return {
    fileName: sanitizedName,
    totalRows: totalDataRows,
    previewCount: projectedRows.length,
    mode,
    columns: activeColumns,
    rows: projectedRows,
  };
}
