import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { profileDataset } from '../../src/lib/dataset/profiler.js';

describe('Dataset Profiler Engine', () => {
  const testDir = path.resolve(process.cwd(), 'tests/fixtures/profiler_sandbox');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });

    // 1. Comprehensive multi-type dataset
    const multiTypeCsv = [
      'id,age,salary,is_active,join_date,last_login,department,notes',
      '1,25,50000.50,true,2023-01-15,2023-01-15T08:30:00Z,Engineering,Junior',
      '2,30,75000.00,false,2022-05-20,2023-04-10T12:00:00Z,Engineering,Senior',
      '3,35,85000.75,true,2021-11-01,2023-06-01T15:45:00Z,Marketing,Lead',
      '4,40,95000.25,true,2020-03-10,2023-07-20T09:15:00Z,Product,Director',
      '5,null,NaN,true,2024-01-01,2024-01-01T10:00:00Z,Engineering,',
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'multitype.csv'), multiTypeCsv);

    // 2. Numeric statistics benchmark dataset
    // Values: 10, 20, 30, 40, 50
    const numericCsv = [
      'val',
      '10',
      '20',
      '30',
      '40',
      '50',
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'numeric_benchmark.csv'), numericCsv);

    // 3. Dataset with duplicate headers and constant column
    const warningsCsv = [
      'category,status,category',
      'Alpha,Active,1',
      'Beta,Active,2',
      'Gamma,Active,3',
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'warnings.csv'), warningsCsv);

    // 4. Dataset with duplicate rows and high nulls
    const duplicatesCsv = [
      'colA,colB,colC',
      'X,1,null',
      'X,1,null',
      'Y,2,null',
      'Y,2,null',
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'duplicates.csv'), duplicatesCsv);

    // 5. Header-only dataset (empty data)
    const headerOnlyCsv = 'colA,colB,colC\n';
    fs.writeFileSync(path.join(testDir, 'header_only.csv'), headerOnlyCsv);

    // 6. Quoted fields and commas
    const quotedCsv = [
      'id,description,amount',
      '1,"Widget, special edition",19.99',
      '2,"Another ""quoted"" item",29.50',
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'quoted.csv'), quotedCsv);

    // 7. Inconsistent row lengths
    const inconsistentCsv = [
      'a,b,c',
      '1,2,3',
      '4,5', // fewer columns
      '6,7,8,9', // extra columns
    ].join('\n');
    fs.writeFileSync(path.join(testDir, 'inconsistent.csv'), inconsistentCsv);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('correctly infers data types and missing counts across multiple columns', async () => {
    const profile = await profileDataset('multitype.csv', { customBaseDir: testDir });

    expect(profile.fileName).toBe('multitype.csv');
    expect(profile.rowCount).toBe(5);
    expect(profile.columnCount).toBe(8);

    const cols = Object.fromEntries(profile.columns.map(c => [c.name, c]));

    // id -> integer
    expect(cols['id']?.inferredType).toBe('integer');
    expect(cols['id']?.nullCount).toBe(0);

    // age -> integer with 1 null
    expect(cols['age']?.inferredType).toBe('integer');
    expect(cols['age']?.nullCount).toBe(1);
    expect(cols['age']?.nullPercentage).toBe(20);

    // salary -> float
    expect(cols['salary']?.inferredType).toBe('float');
    expect(cols['salary']?.nullCount).toBe(1); // 'NaN' treated as null

    // is_active -> boolean
    expect(cols['is_active']?.inferredType).toBe('boolean');
    expect(cols['is_active']?.nullCount).toBe(0);

    // join_date -> date
    expect(cols['join_date']?.inferredType).toBe('date');
    expect(cols['join_date']?.dateStats?.minDate).toBe('2020-03-10T00:00:00.000Z');
    expect(cols['join_date']?.dateStats?.maxDate).toBe('2024-01-01T00:00:00.000Z');

    // last_login -> datetime
    expect(cols['last_login']?.inferredType).toBe('datetime');
    expect(cols['last_login']?.dateStats).toBeDefined();

    // department -> string with top values
    expect(cols['department']?.inferredType).toBe('string');
    expect(cols['department']?.categoricalStats?.topValues[0]).toEqual({
      value: 'Engineering',
      count: 3,
    });
  });

  it('accurately computes numeric statistics: min, max, mean, median, stdDev, quartiles', async () => {
    const profile = await profileDataset('numeric_benchmark.csv', { customBaseDir: testDir });
    const col = profile.columns[0];
    expect(col).toBeDefined();
    expect(col?.inferredType).toBe('integer');

    const stats = col?.numericStats;
    expect(stats).toBeDefined();
    expect(stats?.min).toBe(10);
    expect(stats?.max).toBe(50);
    expect(stats?.mean).toBe(30);
    expect(stats?.median).toBe(30);
    expect(stats?.p25).toBe(20);
    expect(stats?.p75).toBe(40);
    // Sample std dev of [10, 20, 30, 40, 50] is sqrt(1000/4) = sqrt(250) ≈ 15.8114
    expect(stats?.stdDev).toBeCloseTo(15.8114, 3);
  });

  it('detects and disambiguates duplicate headers with warning', async () => {
    const profile = await profileDataset('warnings.csv', { customBaseDir: testDir });
    expect(profile.columns.map(c => c.name)).toEqual(['category', 'status', 'category_2']);

    const duplicateHeaderWarning = profile.warnings.find(w => w.type === 'duplicate_headers');
    expect(duplicateHeaderWarning).toBeDefined();
    expect(duplicateHeaderWarning?.message).toContain("Duplicate column header 'category'");
  });

  it('detects constant columns and generates quality warnings', async () => {
    const profile = await profileDataset('warnings.csv', { customBaseDir: testDir });
    const statusCol = profile.columns.find(c => c.name === 'status');
    expect(statusCol?.distinctCount).toBe(1);

    const constantWarning = profile.warnings.find(w => w.type === 'constant_column');
    expect(constantWarning).toBeDefined();
    expect(constantWarning?.column).toBe('status');
  });

  it('detects duplicate rows and high null percentages', async () => {
    const profile = await profileDataset('duplicates.csv', { customBaseDir: testDir });
    expect(profile.rowCount).toBe(4);
    expect(profile.duplicateRowCount).toBe(2);

    const dupWarning = profile.warnings.find(w => w.type === 'duplicate_rows');
    expect(dupWarning).toBeDefined();

    const colC = profile.columns.find(c => c.name === 'colC');
    expect(colC?.nullPercentage).toBe(100);

    const nullWarning = profile.warnings.find(w => w.type === 'high_null_percentage');
    expect(nullWarning).toBeDefined();
    expect(nullWarning?.column).toBe('colC');
  });

  it('handles header-only datasets cleanly', async () => {
    const profile = await profileDataset('header_only.csv', { customBaseDir: testDir });
    expect(profile.rowCount).toBe(0);
    expect(profile.columnCount).toBe(3);

    const emptyWarning = profile.warnings.find(w => w.type === 'empty_dataset');
    expect(emptyWarning).toBeDefined();
  });

  it('parses quoted fields containing commas correctly', async () => {
    const profile = await profileDataset('quoted.csv', { customBaseDir: testDir });
    expect(profile.rowCount).toBe(2);
    const descCol = profile.columns.find(c => c.name === 'description');
    expect(descCol?.inferredType).toBe('string');
    expect(descCol?.distinctCount).toBe(2);
  });

  it('handles inconsistent rows without crashing and logs warnings', async () => {
    const profile = await profileDataset('inconsistent.csv', { customBaseDir: testDir });
    expect(profile.rowCount).toBe(3);

    const rowWarnings = profile.warnings.filter(w => w.type === 'inconsistent_rows');
    expect(rowWarnings.length).toBeGreaterThan(0);
  });
});
