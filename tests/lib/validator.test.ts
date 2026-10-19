import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateAndResolveDatasetPath,
  PathTraversalError,
  UnsupportedFormatError,
  DatasetNotFoundError,
  DatasetEmptyError,
  FileTooLargeError,
  DatasetValidationError,
} from '../../src/lib/dataset/validator.js';

describe('Dataset Path and File Validator', () => {
  const testBaseDir = path.resolve(process.cwd(), 'tests/fixtures/validator_sandbox');

  beforeAll(() => {
    fs.mkdirSync(testBaseDir, { recursive: true });
    // Create valid test file
    fs.writeFileSync(path.join(testBaseDir, 'valid.csv'), 'id,name\n1,Alpha');
    // Create empty test file
    fs.writeFileSync(path.join(testBaseDir, 'empty.csv'), '');
    // Create unsupported format file
    fs.writeFileSync(path.join(testBaseDir, 'data.json'), '{"key":"value"}');
    // Create subfolder
    fs.mkdirSync(path.join(testBaseDir, 'subfolder'), { recursive: true });
    fs.writeFileSync(path.join(testBaseDir, 'subfolder/nested.csv'), 'id,val\n1,10');
  });

  afterAll(() => {
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  it('resolves valid csv file within allowed base directory', () => {
    const result = validateAndResolveDatasetPath('valid.csv', testBaseDir);
    expect(result.sanitizedName).toBe('valid.csv');
    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(result.resolvedPath)).toBe(true);
  });

  it('resolves valid csv file in nested directory', () => {
    const result = validateAndResolveDatasetPath('subfolder/nested.csv', testBaseDir);
    expect(result.sanitizedName).toBe('subfolder/nested.csv');
    expect(result.fileSizeBytes).toBeGreaterThan(0);
  });

  it('rejects path traversal attempts outside authorized base directory', () => {
    expect(() =>
      validateAndResolveDatasetPath('../outside.csv', testBaseDir)
    ).toThrow(PathTraversalError);

    expect(() =>
      validateAndResolveDatasetPath('../../etc/passwd.csv', testBaseDir)
    ).toThrow(PathTraversalError);
  });

  it('rejects unsupported file formats', () => {
    expect(() =>
      validateAndResolveDatasetPath('data.json', testBaseDir)
    ).toThrow(UnsupportedFormatError);

    expect(() =>
      validateAndResolveDatasetPath('sheet.xlsx', testBaseDir)
    ).toThrow(UnsupportedFormatError);

    expect(() =>
      validateAndResolveDatasetPath('binary.exe', testBaseDir)
    ).toThrow(UnsupportedFormatError);
  });

  it('rejects non-existent files with sanitized relative path', () => {
    expect(() =>
      validateAndResolveDatasetPath('missing.csv', testBaseDir)
    ).toThrow(DatasetNotFoundError);

    try {
      validateAndResolveDatasetPath('missing.csv', testBaseDir);
    } catch (err) {
      expect(err instanceof DatasetNotFoundError).toBe(true);
      // Ensure absolute host paths are not leaked in message
      expect((err as Error).message).not.toContain(testBaseDir);
      expect((err as Error).message).toContain('missing.csv');
    }
  });

  it('rejects empty files (0 bytes)', () => {
    expect(() =>
      validateAndResolveDatasetPath('empty.csv', testBaseDir)
    ).toThrow(DatasetEmptyError);
  });

  it('rejects directories passed as file path', () => {
    expect(() =>
      validateAndResolveDatasetPath('subfolder.csv', testBaseDir)
    ).toThrow(DatasetNotFoundError);

    // If an actual directory has .csv extension:
    const dirWithCsvExt = path.join(testBaseDir, 'fake_file.csv');
    fs.mkdirSync(dirWithCsvExt, { recursive: true });
    expect(() =>
      validateAndResolveDatasetPath('fake_file.csv', testBaseDir)
    ).toThrow(DatasetValidationError);
    fs.rmdirSync(dirWithCsvExt);
  });

  it('rejects files exceeding size limit', () => {
    // 5 bytes limit on valid.csv (which is >10 bytes)
    expect(() =>
      validateAndResolveDatasetPath('valid.csv', testBaseDir, 5)
    ).toThrow(FileTooLargeError);
  });

  it('rejects empty or blank path strings', () => {
    expect(() => validateAndResolveDatasetPath('', testBaseDir)).toThrow(
      DatasetValidationError
    );
    expect(() => validateAndResolveDatasetPath('   ', testBaseDir)).toThrow(
      DatasetValidationError
    );
  });
});
