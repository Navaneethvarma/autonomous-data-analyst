import fs from 'node:fs';
import path from 'node:path';
import { getEnvConfig } from '../../config/env.js';

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetValidationError';
  }
}

export class PathTraversalError extends DatasetValidationError {
  constructor(message: string = 'Access denied: path traverses outside the authorized dataset directory.') {
    super(message);
    this.name = 'PathTraversalError';
  }
}

export class UnsupportedFormatError extends DatasetValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

export class DatasetNotFoundError extends DatasetValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetNotFoundError';
  }
}

export class DatasetEmptyError extends DatasetValidationError {
  constructor(message: string = 'Dataset file is empty (0 bytes).') {
    super(message);
    this.name = 'DatasetEmptyError';
  }
}

export class FileTooLargeError extends DatasetValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'FileTooLargeError';
  }
}

export interface ValidatedDatasetFile {
  resolvedPath: string;
  sanitizedName: string;
  fileSizeBytes: number;
}

/**
 * Validates and resolves an input file path against the authorized datasets directory.
 * Defends against path traversal, symlink attacks, unsupported formats, and oversized files.
 */
export function validateAndResolveDatasetPath(
  requestedPath: string,
  customBaseDir?: string,
  maxSizeBytes?: number
): ValidatedDatasetFile {
  if (!requestedPath || requestedPath.trim() === '') {
    throw new DatasetValidationError('File path cannot be empty.');
  }

  const env = getEnvConfig();
  const rawBaseDir = customBaseDir ?? env.DATASETS_DIR;
  const baseDir = path.resolve(process.cwd(), rawBaseDir);

  // If requestedPath is relative, resolve it relative to baseDir; if absolute, resolve directly.
  const candidatePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(baseDir, requestedPath);

  // Normalize baseDir and ensure trailing separator for strict prefix comparison
  const normalizedBase = path.normalize(baseDir);
  const normalizedCandidate = path.normalize(candidatePath);

  // Path traversal check
  const isInside =
    normalizedCandidate === normalizedBase ||
    normalizedCandidate.startsWith(normalizedBase + path.sep);

  if (!isInside) {
    throw new PathTraversalError(
      'Access denied: path traverses outside the authorized dataset directory.'
    );
  }

  // Extension check (Supports CSV and Parquet)
  const ext = path.extname(normalizedCandidate).toLowerCase();
  if (ext !== '.csv' && ext !== '.parquet') {
    throw new UnsupportedFormatError(
      `Unsupported dataset format '${ext || 'unknown'}'. Only '.csv' and '.parquet' files are supported.`
    );
  }

  // File existence check
  if (!fs.existsSync(normalizedCandidate)) {
    // Sanitized display name (relative to base dir)
    const displayRel = path.relative(normalizedBase, normalizedCandidate).replace(/\\/g, '/');
    throw new DatasetNotFoundError(`Dataset file '${displayRel}' was not found.`);
  }

  // Realpath check to prevent symlinks pointing outside baseDir
  let realCandidatePath: string;
  try {
    realCandidatePath = fs.realpathSync(normalizedCandidate);
  } catch (err) {
    throw new DatasetValidationError(
      `Failed to resolve dataset file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const realBaseDir = fs.existsSync(normalizedBase)
    ? fs.realpathSync(normalizedBase)
    : normalizedBase;

  const isRealInside =
    realCandidatePath === realBaseDir ||
    realCandidatePath.startsWith(realBaseDir + path.sep);

  if (!isRealInside) {
    throw new PathTraversalError(
      'Access denied: symlink resolves outside the authorized dataset directory.'
    );
  }

  // File stats check
  const stats = fs.statSync(realCandidatePath);
  if (!stats.isFile()) {
    throw new DatasetValidationError('The specified path is a directory, not a dataset file.');
  }

  if (stats.size === 0) {
    throw new DatasetEmptyError('Dataset file is empty (0 bytes).');
  }

  const maxAllowedBytes = maxSizeBytes ?? env.MAX_DATASET_SIZE_MB * 1024 * 1024;
  if (stats.size > maxAllowedBytes) {
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    const maxMb = (maxAllowedBytes / (1024 * 1024)).toFixed(0);
    throw new FileTooLargeError(
      `Dataset file size (${sizeMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`
    );
  }

  const sanitizedName = path.relative(realBaseDir, realCandidatePath).replace(/\\/g, '/');

  return {
    resolvedPath: realCandidatePath,
    sanitizedName: sanitizedName || path.basename(realCandidatePath),
    fileSizeBytes: stats.size,
  };
}
