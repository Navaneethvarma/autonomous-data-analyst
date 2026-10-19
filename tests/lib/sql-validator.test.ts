import { describe, it, expect } from 'vitest';
import {
  validateReadOnlySql,
  SqlSecurityError,
  SqlSyntaxError,
} from '../../src/lib/analytics/sql-validator.js';

describe('SQL Security & Read-Only Validator', () => {
  it('permits simple SELECT query on authorized dataset table', () => {
    const { sanitizedSql } = validateReadOnlySql('SELECT * FROM dataset');
    expect(sanitizedSql).toBe('SELECT * FROM dataset');
  });

  it('permits complex analytical queries with aggregations, filters, and grouping', () => {
    const sql = `
      SELECT 
        product_category,
        COUNT(*) as total_transactions,
        SUM(quantity) as units_sold,
        AVG(unit_price) as avg_price
      FROM dataset
      WHERE is_returned = false AND unit_price > 10
      GROUP BY product_category
      ORDER BY units_sold DESC
      LIMIT 10
    `;
    const { sanitizedSql } = validateReadOnlySql(sql);
    expect(sanitizedSql).toContain('SELECT');
    expect(sanitizedSql).toContain('FROM dataset');
  });

  it('permits queries utilizing CTEs (WITH clause)', () => {
    const sql = `
      WITH summary AS (
        SELECT product_category, SUM(quantity) as total_qty
        FROM dataset
        GROUP BY product_category
      )
      SELECT product_category, total_qty
      FROM summary
      ORDER BY total_qty DESC
    `;
    const { sanitizedSql } = validateReadOnlySql(sql);
    expect(sanitizedSql).toContain('WITH summary AS');
  });

  it('permits queries with parameters placeholder ($1, $2 or ?)', () => {
    const sql = `SELECT * FROM dataset WHERE unit_price > ? AND product_category = ?`;
    const { sanitizedSql } = validateReadOnlySql(sql);
    expect(sanitizedSql).toBe(sql);
  });

  it('strips safe trailing semicolon from single statement', () => {
    const { sanitizedSql } = validateReadOnlySql('SELECT id, name FROM dataset;');
    expect(sanitizedSql).toBe('SELECT id, name FROM dataset');
  });

  it('rejects multiple statements separated by semicolons', () => {
    const attack = 'SELECT * FROM dataset; DROP TABLE dataset;';
    expect(() => validateReadOnlySql(attack)).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql(attack)).toThrow(/Multiple SQL statements are strictly prohibited/);
  });

  it('rejects statement chaining attempt inside comment or string hiding', () => {
    const attack = 'SELECT * FROM dataset; SELECT 1;';
    expect(() => validateReadOnlySql(attack)).toThrow(SqlSecurityError);
  });

  it('rejects DML mutation statements', () => {
    expect(() => validateReadOnlySql('INSERT INTO dataset VALUES (1, "fake")')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('UPDATE dataset SET quantity = 0')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('DELETE FROM dataset WHERE id = 1')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('TRUNCATE TABLE dataset')).toThrow(SqlSecurityError);
  });

  it('rejects DDL and schema mutation statements', () => {
    expect(() => validateReadOnlySql('DROP TABLE dataset')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('CREATE TABLE stolen AS SELECT * FROM dataset')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('ALTER TABLE dataset ADD COLUMN hacked VARCHAR')).toThrow(SqlSecurityError);
  });

  it('rejects extension loading and external file access functions', () => {
    expect(() => validateReadOnlySql("SELECT * FROM read_csv('/etc/passwd')")).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql("SELECT * FROM read_parquet('s3://bucket/data')")).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql("INSTALL httpfs;")).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql("LOAD httpfs;")).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql("ATTACH 'test.db';")).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql("COPY dataset TO 'output.csv'")).toThrow(SqlSecurityError);
  });

  it('rejects unauthorized table access', () => {
    expect(() => validateReadOnlySql('SELECT * FROM users')).toThrow(SqlSecurityError);
    expect(() => validateReadOnlySql('SELECT * FROM dataset d JOIN secret_keys s ON d.id = s.id')).toThrow(
      SqlSecurityError
    );
  });

  it('rejects empty or whitespace-only queries', () => {
    expect(() => validateReadOnlySql('')).toThrow(SqlSyntaxError);
    expect(() => validateReadOnlySql('   ')).toThrow(SqlSyntaxError);
  });

  it('rejects malformed SQL syntax', () => {
    expect(() => validateReadOnlySql('SELECT FROM WHERE')).toThrow(SqlSyntaxError);
  });
});
