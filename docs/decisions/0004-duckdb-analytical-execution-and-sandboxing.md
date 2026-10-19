# ADR 0004: In-Memory DuckDB Analytical Execution Engine and AST Sandboxing

## Status
Accepted

## Context
In Milestone 4, the Autonomous Data Analyst requires an analytical execution engine capable of executing genuine calculations (aggregations, filters, groupings, joins, date bucketing) against business datasets (CSV and Parquet).

Key requirements:
1. **Verification Over Hallucination**: The agent must execute real queries and return verifiable outputs rather than hallucinating calculations.
2. **Embedded & Zero-DevOps**: The system must run without requiring an external PostgreSQL, MySQL, or ClickHouse server daemon or Docker setup.
3. **Execution Safety & Sandboxing**: Prevent SQL injection, multi-statement attacks, arbitrary filesystem access (e.g. reading `/etc/passwd` or host files via SQL), extension loading, and mutation of datasets.
4. **Aggregate Completeness**: Computations must reflect the entire authorized dataset, clearly distinguishing bounded result presentation from underlying calculation scope.

## Decisions

### 1. Embedded DuckDB Engine
We selected DuckDB (`duckdb` v1.4.4) running directly in-process via Node.js native C++ bindings:
- **In-Memory Isolation**: Each analytical execution initializes an isolated in-memory instance (`:memory:`) with capped memory limits (`max_memory: 512MB`).
- **Native CSV and Parquet Support**: Leverages DuckDB's vectorized execution engine for both delimited text (`read_csv_auto`) and columnar Parquet (`read_parquet`).
- **Null-String Recognition**: Explicitly configures `nullstr=['null', 'NULL', 'NaN', 'NA', 'n/a', 'N/A', 'None', 'none', '']` so literal text nulls do not force numeric columns into VARCHAR.
- **Immediate Cleanup**: Resources are cleanly closed (`db.close()`) in a `finally` block with safety timeouts.

### 2. Double-Layer Sandboxing (Kernel + AST)

#### Layer 1: In-Memory Pre-Materialization & Engine Lockdown
1. Path validation resolves the file canonically via [`validateAndResolveDatasetPath`](../../src/lib/dataset/validator.ts), preventing path traversal.
2. The dataset is materialized into an in-memory table:
   ```sql
   CREATE TABLE "dataset" AS SELECT * FROM read_csv_auto('...', header=true, nullstr=[...]);
   ```
3. Once materialized into RAM, the DuckDB kernel is locked down:
   ```sql
   SET enable_external_access = false;
   ```
   This disables all subsequent external filesystem access, socket connections, and extension installations directly at the DuckDB engine level. Even if malicious SQL bypasses parsing, DuckDB rejects any attempt to read host files or access networks.

#### Layer 2: AST-Based Read-Only SQL Validator
Before any query reaches DuckDB, [`validateReadOnlySql`](../../src/lib/analytics/sql-validator.ts) executes three levels of inspection:
1. **Multi-Statement Defense**: Detects and rejects semicolon-chained statements outside quoted literals.
2. **Lexical Blocklist**: Rejects prohibited keywords (`insert`, `update`, `delete`, `drop`, `create`, `alter`, `replace`, `truncate`, `copy`, `attach`, `detach`, `install`, `load`, `pragma`, `read_csv`, `read_parquet`, etc.).
3. **AST Structure Validation**: Uses `node-sql-parser` (PostgreSQL dialect mode) to parse the AST. Asserts that the AST root is strictly `select` (or CTE with root `select`).
4. **Table Allowlist Check**: Extracts all referenced tables and CTE definitions. Rejects any reference to tables outside the authorized table alias (`dataset`) and locally defined CTEs.

### 3. Limitations of PostgreSQL-Dialect Parsing Against DuckDB Syntax
- **Dialect Alignment**: DuckDB's SQL syntax is heavily PostgreSQL-compatible (window functions, CTEs, standard aggregations, casting, and expressions).
- **DuckDB Dialect Extensions**: DuckDB supports non-standard SQL shortcuts (such as `FROM table SELECT ...` omitting the leading SELECT keyword, or python-style slice notation). Our AST validator requires standard ANSI/PostgreSQL SQL (`SELECT ... FROM ...`), which is the standard expected of analytical models and avoids ambiguity.
- **Safe Fallback**: If PostgreSQL dialect parsing fails on DuckDB-specific functions, a generic dialect parse is attempted, followed by strict AST verification and table allowlist enforcement. If parsing fails, the query is rejected before execution.

### 4. Aggregate Completeness vs Bounded Result Presentation
- Calculations (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY`) always execute against the complete dataset materialized in RAM.
- `rowLimit` (default 1000, max 5000) only bounds the number of rows serialized and returned to the caller, preventing memory bloat.
- When rows exceed `rowLimit`, the result includes `isTruncated: true`, preserving aggregate integrity while warning the consumer that row presentation is bounded.

### 5. Mastra Agent Integration
The engine is wrapped in [`executeAnalyticalQueryTool`](../../src/mastra/tools/execute-analytical-query-tool.ts) with typed Zod schemas and registered on [`dataAnalystAgent`](../../src/mastra/agents/data-analyst-agent.ts). The agent is instructed to plan, execute via DuckDB, inspect returned provenance, and explain evidence-backed results without fabricating figures.

## Consequences
- Fast, secure analytical SQL execution natively within Node.js.
- Verifiable metrics with tamper-evident provenance metadata (`datasetFile`, `executedSql`, `executionTimeMs`, `rowLimitApplied`, `isTruncated`, `engine`).
- Hard guarantees against SQL injection, data mutation, and unauthorized host filesystem exfiltration.
