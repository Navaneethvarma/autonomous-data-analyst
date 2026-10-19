import NodeSqlParser from 'node-sql-parser';
import type { AST, Select } from 'node-sql-parser';

const { Parser } = NodeSqlParser;

export class SqlSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlSecurityError';
  }
}

export class SqlSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlSyntaxError';
  }
}

const parser = new Parser();

const PROHIBITED_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'drop',
  'create',
  'alter',
  'replace',
  'truncate',
  'merge',
  'copy',
  'attach',
  'detach',
  'export',
  'import',
  'install',
  'load',
  'pragma',
  'call',
  'set',
  'reset',
  'checkpoint',
  'read_csv',
  'read_csv_auto',
  'read_parquet',
  'scan',
  'write_parquet',
  'read_json',
  'read_json_auto',
  'parquet_scan',
  'csv_scan',
  'pg_read_file',
  'pg_ls_dir',
]);

/**
 * Checks for multiple SQL statements separated by semicolons.
 */
function checkForMultipleStatements(sql: string): void {
  // Strip single-line comments (-- ...) and block comments (/* ... */)
  const noComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();

  // Remove trailing semicolon if any
  const trimmed = noComments.endsWith(';') ? noComments.slice(0, -1).trim() : noComments;

  // Check if any semicolon remains outside single/double quoted string literals
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      throw new SqlSecurityError(
        'Multiple SQL statements are strictly prohibited. Only single analytical SELECT queries are permitted.'
      );
    }
  }
}

/**
 * Recursively extracts defined CTE names from a WITH clause.
 */
function extractCteNames(ast: Select): Set<string> {
  const cteNames = new Set<string>();
  if (ast.with && Array.isArray(ast.with)) {
    for (const cte of ast.with) {
      if (cte.name?.value) {
        cteNames.add(cte.name.value.toLowerCase());
      }
    }
  }
  return cteNames;
}

/**
 * Recursively inspects AST nodes to collect any referenced table names.
 */
function recursivelyCollectAstTables(node: unknown, collected: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      recursivelyCollectAstTables(item, collected);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.table && typeof obj.table === 'string') {
    collected.add(obj.table.toLowerCase());
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      recursivelyCollectAstTables(val, collected);
    }
  }
}

/**
 * Validates that an analytical query is strictly a read-only SELECT statement
 * and only references approved tables/CTEs.
 */
export function validateReadOnlySql(
  sql: string,
  allowedTableAliases: string[] = ['dataset']
): { sanitizedSql: string } {
  if (!sql || sql.trim() === '') {
    throw new SqlSyntaxError('SQL query string cannot be empty.');
  }

  const trimmedSql = sql.trim();

  // 1. Check for semicolon statement chaining
  checkForMultipleStatements(trimmedSql);

  // 2. Lexical check for prohibited keyword tokens
  const tokenRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(trimmedSql)) !== null) {
    const token = match[1]?.toLowerCase();
    if (token && PROHIBITED_KEYWORDS.has(token)) {
      throw new SqlSecurityError(
        `Prohibited keyword or operation '${token.toUpperCase()}' detected. Only read-only analytical SELECT operations are authorized.`
      );
    }
  }

  // 3. AST Parsing with node-sql-parser
  let ast: AST | AST[];
  try {
    ast = parser.astify(trimmedSql, { database: 'PostgreSQL' });
  } catch (parseError) {
    // If PostgreSQL mode parser fails on DuckDB-specific dialect, try Generic
    try {
      ast = parser.astify(trimmedSql);
    } catch {
      throw new SqlSyntaxError(
        `Failed to parse SQL query: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }
  }

  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      throw new SqlSecurityError('Query must contain exactly one statement.');
    }
    ast = ast[0]!;
  }

  // 4. Verify AST root type is strictly 'select'
  if (!ast || ast.type !== 'select') {
    throw new SqlSecurityError(
      `Statement type '${(ast as any)?.type || 'unknown'}' is prohibited. Only 'select' queries are authorized.`
    );
  }

  // 5. Table reference validation
  let tableList: string[] = [];
  try {
    tableList = parser.tableList(trimmedSql, { database: 'PostgreSQL' });
  } catch {
    try {
      tableList = parser.tableList(trimmedSql);
    } catch {
      // Handled through AST table scan if tableList extraction fails
    }
  }

  const selectAst = ast as Select;
  const cteNames = extractCteNames(selectAst);
  const allowedTables = new Set([
    ...allowedTableAliases.map(t => t.toLowerCase()),
    ...Array.from(cteNames),
  ]);

  // Check tables extracted by parser.tableList
  for (const entry of tableList) {
    // entry format: "select::database::table_name"
    const parts = entry.split('::');
    const tableName = parts[parts.length - 1]?.toLowerCase();
    if (tableName && !allowedTables.has(tableName)) {
      throw new SqlSecurityError(
        `Unauthorized table or source reference '${tableName}'. Queries may only reference authorized dataset view(s) [${allowedTableAliases.map(a => `'${a}'`).join(', ')}] or locally defined CTEs.`
      );
    }
  }

  // Fallback / defense-in-depth: check tables found directly in AST nodes
  const astTables = new Set<string>();
  recursivelyCollectAstTables(ast, astTables);
  for (const tbl of astTables) {
    if (!allowedTables.has(tbl)) {
      throw new SqlSecurityError(
        `Unauthorized table or source reference '${tbl}'. Queries may only reference authorized dataset view(s) [${allowedTableAliases.map(a => `'${a}'`).join(', ')}] or locally defined CTEs.`
      );
    }
  }

  // Strip trailing semicolon if present for clean parameterized execution
  const sanitizedSql = trimmedSql.endsWith(';') ? trimmedSql.slice(0, -1).trim() : trimmedSql;

  return { sanitizedSql };
}
