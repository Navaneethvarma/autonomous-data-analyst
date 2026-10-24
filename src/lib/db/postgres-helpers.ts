import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

/**
 * Builds a parameterized UPDATE SQL statement and values array from a partial record.
 * Maps camelCase entity fields to snake_case column names.
 */
export function buildDynamicUpdate(
  tableName: string,
  id: string,
  updates: Record<string, unknown>,
  setUpdatedAt = true
): { sql: string; values: unknown[] } | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    if (key === 'id') continue;
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    fields.push(`${snake} = $${idx++}`);
    values.push(val);
  }

  if (fields.length === 0) return null;

  if (setUpdatedAt) {
    fields.push('updated_at = NOW()');
  }
  values.push(id);

  return {
    sql: `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${idx}`,
    values,
  };
}

/**
 * Applies pending PostgreSQL schema migrations from the migrations directory.
 */
export async function runPostgresMigrations(pool: pg.Pool): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const appliedRes = await client.query('SELECT version FROM _migrations');
    const appliedVersions = new Set<string>(appliedRes.rows.map(r => r.version));

    for (const file of files) {
      const version = file.split('_')[0] || file;
      if (!appliedVersions.has(version)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            `INSERT INTO _migrations (version, name, applied_at)
             VALUES ($1, $2, NOW())`,
            [version, file]
          );
          await client.query('COMMIT');
        } catch (migrationErr) {
          await client.query('ROLLBACK');
          throw migrationErr;
        }
      }
    }
  } finally {
    client.release();
  }
}
