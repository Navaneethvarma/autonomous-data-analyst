import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import duckdb from 'duckdb';
import {
  executeAnalyticalQuery,
  QueryTimeoutError,
} from '../../src/lib/analytics/duckdb-engine.js';
import { SqlSecurityError } from '../../src/lib/analytics/sql-validator.js';

describe('DuckDB Analytical Execution Engine', () => {
  const testBaseDir = path.resolve(process.cwd(), 'tests/fixtures/analytics_sandbox');
  const csvFile = 'analytics_test.csv';
  const parquetFile = 'analytics_test.parquet';

  beforeAll(async () => {
    fs.mkdirSync(testBaseDir, { recursive: true });

    // 1. Create a known test CSV dataset with various types, nulls, and dates
    const csvContent = [
      'id,transaction_date,product_category,quantity,unit_price,status',
      '1,2026-01-15,Electronics,2,499.99,completed',
      '2,2026-01-20,Electronics,1,199.99,completed',
      '3,2026-02-05,Apparel,5,29.95,completed',
      '4,2026-02-14,Apparel,2,49.50,returned',
      '5,2026-03-01,Home,3,75.00,completed',
      '6,2026-03-10,Home,1,120.00,completed',
      '7,2026-03-15,Electronics,4,null,completed', // null literal test
      '8,2026-03-22,Beauty,2,15.50,completed',
    ].join('\n');
    fs.writeFileSync(path.join(testBaseDir, csvFile), csvContent, 'utf-8');

    // 2. Generate a Parquet version using DuckDB to test Parquet support
    await new Promise<void>((resolve, reject) => {
      const db = new duckdb.Database(':memory:');
      const normCsv = path.join(testBaseDir, csvFile).replace(/\\/g, '/');
      const normParquet = path.join(testBaseDir, parquetFile).replace(/\\/g, '/');
      db.all(
        `COPY (SELECT * FROM read_csv_auto('${normCsv}', header=true, nullstr=['null', ''])) TO '${normParquet}' (FORMAT PARQUET);`,
        (err) => {
          if (err) {
            db.close(() => reject(err));
          } else {
            db.close(() => resolve());
          }
        }
      );
    });
  }, 30000);

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore transient Windows EBUSY lock during test runner teardown
    }
  });

  it('executes aggregations (COUNT, SUM, AVG, MIN, MAX) accurately on CSV', async () => {
    const result = await executeAnalyticalQuery(
      {
        datasetPath: csvFile,
        sql: `
          SELECT 
            COUNT(*) as total_count,
            SUM(quantity) as total_units,
            ROUND(AVG(unit_price), 2) as avg_price,
            MIN(unit_price) as min_price,
            MAX(unit_price) as max_price
          FROM dataset
        `,
      },
      { customBaseDir: testBaseDir }
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.total_count).toBe(8);
    expect(result.rows[0]?.total_units).toBe(20);
    // 7 non-null prices: 499.99 + 199.99 + 29.95 + 49.50 + 75.00 + 120.00 + 15.50 = 989.93
    // 989.93 / 7 = 141.41857... -> round(2) = 141.42
    expect(result.rows[0]?.avg_price).toBe(141.42);
    expect(result.rows[0]?.min_price).toBe(15.5);
    expect(result.rows[0]?.max_price).toBe(499.99);
    expect(result.isTruncated).toBe(false);
    expect(result.provenance.engine).toContain('DuckDB');
  });

  it('supports grouping, sorting, and period aggregation', async () => {
    const result = await executeAnalyticalQuery(
      {
        datasetPath: csvFile,
        sql: `
          SELECT 
            product_category,
            SUM(quantity) as total_qty
          FROM dataset
          GROUP BY product_category
          ORDER BY total_qty DESC, product_category ASC
        `,
      },
      { customBaseDir: testBaseDir }
    );

    expect(result.rowCount).toBe(4);
    // Categories: Apparel: 5+2=7, Electronics: 2+1+4=7, Home: 3+1=4, Beauty: 2
    expect(result.rows[0]?.product_category).toBe('Apparel');
    expect(result.rows[0]?.total_qty).toBe(7);
    expect(result.rows[1]?.product_category).toBe('Electronics');
    expect(result.rows[1]?.total_qty).toBe(7);
  });

  it('supports parameterized queries safely', async () => {
    const result = await executeAnalyticalQuery(
      {
        datasetPath: csvFile,
        sql: `
          SELECT id, product_category, quantity
          FROM dataset
          WHERE product_category = ? AND quantity >= ?
          ORDER BY quantity DESC
        `,
        parameters: ['Electronics', 2],
      },
      { customBaseDir: testBaseDir }
    );

    expect(result.rowCount).toBe(2);
    expect(result.rows.every(r => r.product_category === 'Electronics')).toBe(true);
  });

  it('supports Parquet dataset execution natively', async () => {
    const result = await executeAnalyticalQuery(
      {
        datasetPath: parquetFile,
        sql: 'SELECT COUNT(*) as count FROM dataset',
      },
      { customBaseDir: testBaseDir }
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.count).toBe(8);
  });

  it('applies row limits without corrupting aggregate completeness', async () => {
    const result = await executeAnalyticalQuery(
      {
        datasetPath: csvFile,
        sql: 'SELECT id, product_category FROM dataset ORDER BY id ASC',
        rowLimit: 3,
      },
      { customBaseDir: testBaseDir }
    );

    expect(result.rowCount).toBe(3);
    expect(result.isTruncated).toBe(true);
    expect(result.rows.length).toBe(3);
  });

  it('enforces execution timeout and terminates safely', async () => {
    await expect(
      executeAnalyticalQuery(
        {
          datasetPath: csvFile,
          sql: `
            WITH RECURSIVE t(n) AS (
              SELECT 1
              UNION ALL
              SELECT n + 1 FROM t WHERE n < 10000000
            )
            SELECT COUNT(*) FROM t
          `,
          timeoutMs: 100,
        },
        { customBaseDir: testBaseDir }
      )
    ).rejects.toThrow(QueryTimeoutError);
  }, 10000);

  it('blocks SQL injection and mutation attempts at validation layer', async () => {
    await expect(
      executeAnalyticalQuery(
        {
          datasetPath: csvFile,
          sql: 'DROP TABLE dataset;',
        },
        { customBaseDir: testBaseDir }
      )
    ).rejects.toThrow(SqlSecurityError);
  });

  it('prevents external file access via DuckDB sandbox', async () => {
    await expect(
      executeAnalyticalQuery(
        {
          datasetPath: csvFile,
          sql: "SELECT * FROM read_csv('/etc/passwd')",
        },
        { customBaseDir: testBaseDir }
      )
    ).rejects.toThrow(SqlSecurityError);
  });
});
