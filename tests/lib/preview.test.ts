import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { previewDataset, InvalidColumnError } from '../../src/lib/dataset/preview.js';
import { PathTraversalError } from '../../src/lib/dataset/validator.js';

describe('Dataset Preview Engine', () => {
  const testDir = path.resolve(process.cwd(), 'tests/fixtures/preview_sandbox');
  const sampleCsv = path.join(testDir, 'preview_sample.csv');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const content = [
      'id,name,role,salary',
      '1,Alice,Engineer,90000',
      '2,Bob,Designer,80000',
      '3,Charlie,Product,95000',
      '4,Diana,Marketing,85000',
      '5,Evan,Sales,75000',
      '6,Fiona,Support,65000',
    ].join('\n');
    fs.writeFileSync(sampleCsv, content);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('previews records in head mode with custom limit', async () => {
    const result = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      mode: 'head',
      limit: 2,
    });

    expect(result.mode).toBe('head');
    expect(result.totalRows).toBe(6);
    expect(result.previewCount).toBe(2);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]?.['name']).toBe('Alice');
    expect(result.rows[1]?.['name']).toBe('Bob');
  });

  it('previews records in tail mode', async () => {
    const result = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      mode: 'tail',
      limit: 2,
    });

    expect(result.mode).toBe('tail');
    expect(result.previewCount).toBe(2);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]?.['name']).toBe('Evan');
    expect(result.rows[1]?.['name']).toBe('Fiona');
  });

  it('previews records in sample mode with bounded count', async () => {
    const result = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      mode: 'sample',
      limit: 3,
    });

    expect(result.mode).toBe('sample');
    expect(result.previewCount).toBe(3);
    expect(result.rows.length).toBe(3);
    for (const r of result.rows) {
      expect(r['id']).toBeDefined();
    }
  });

  it('projects only specified columns', async () => {
    const result = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      columns: ['name', 'salary'],
      limit: 2,
    });

    expect(result.columns).toEqual(['name', 'salary']);
    expect(result.rows[0]).toEqual({ name: 'Alice', salary: '90000' });
    expect(result.rows[0]?.['role']).toBeUndefined();
  });

  it('rejects requested columns that do not exist in the dataset', async () => {
    await expect(
      previewDataset('preview_sample.csv', {
        customBaseDir: testDir,
        columns: ['name', 'non_existent_column'],
      })
    ).rejects.toThrow(InvalidColumnError);
  });

  it('clamps limits between 1 and 100', async () => {
    const minClamped = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      limit: -5,
    });
    expect(minClamped.previewCount).toBe(1);

    const maxClamped = await previewDataset('preview_sample.csv', {
      customBaseDir: testDir,
      limit: 500,
    });
    // Total rows is 6, so clamped limit of 100 returns all 6
    expect(maxClamped.previewCount).toBe(6);
  });

  it('enforces path traversal defense during preview', async () => {
    await expect(
      previewDataset('../preview_sample.csv', { customBaseDir: testDir })
    ).rejects.toThrow(PathTraversalError);
  });
});
