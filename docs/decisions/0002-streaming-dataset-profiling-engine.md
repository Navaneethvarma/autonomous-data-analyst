# ADR 0002: Streaming Dataset Profiling Engine with Memory and Security Boundaries

## Status
Accepted

## Context
In Milestone 2, the Autonomous Data Analyst requires dataset profiling capabilities so that the agent can inspect table structure, column names, empirical data types, null rates, duplicate rows, summary statistics, and data quality warnings.

Because datasets can be large (up to multi-gigabytes) and untrusted (user-uploaded files containing arbitrary characters, formulas, or formatting anomalies), loading files entirely into memory as giant arrays or executing arbitrary code / eval is unacceptable.

We must define:
1. File format support strategy (CSV first, extensible to Parquet).
2. Processing model (streaming vs full in-memory buffering).
3. Security boundaries (filesystem access, path traversal, resource limits).
4. Statistical computation methods.

## Decision

1. **Streaming CSV Engine**:
   - We utilize `csv-parse` connected to a Node.js `fs.createReadStream` to process records iteratively without buffering the raw file into RAM.
   - Headers are evaluated first and duplicate header names are disambiguated by appending numerical suffixes (e.g. `col_2`) while emitting a `duplicate_headers` warning.
   - Duplicate rows are detected by computing SHA-256 hashes of individual serialized row records, tracking duplicate occurrences with minimal memory consumption.

2. **Security & Sandboxing**:
   - File access is strictly constrained to an authorized base directory (`DATASETS_DIR`, default `./datasets`).
   - Path traversal attempts (`..`, escaped relative paths, symlinks pointing outside) are rejected using `path.normalize`, `path.resolve`, and `fs.realpathSync`.
   - File extensions are restricted to `.csv` in Milestone 2.
   - File size is capped (default: 50 MB, configurable via `MAX_DATASET_SIZE_MB`).
   - Absolute server paths are never exposed in user-facing error messages or profile output; paths are sanitized to relative paths.
   - Zero dynamic code execution: parsing is performed strictly through deterministic parsing and classification rules.

3. **Statistical Calculations**:
   - Dominant data types are inferred through deterministic regular expressions and parsing rules (`integer`, `float`, `boolean`, `date`, `datetime`, `string`).
   - Numeric columns track exact minimum, maximum, mean, sample standard deviation ($s = \sqrt{\frac{1}{N-1}\sum (x_i - \bar{x})^2}$), median, and quartiles (p25, p75) using linear quantile interpolation.
   - Distinct values and category counts are bounded to prevent unbounded memory growth on high-cardinality keys.

4. **Extensibility for Parquet (Future Milestone)**:
   - The profiling interface outputs a standardized `DatasetProfile` schema independent of source format. In a future milestone, an Apache Arrow / Parquet adapter can be introduced implementing the same output schema.

## Consequences
- The profiling engine is fast, memory-safe, and resilient against malformed inputs and path traversal attacks.
- High-cardinality and large-file edge cases are handled safely with clear warnings rather than application crashes.
- The Mastra tool `profileDatasetTool` exposes typed Zod input/output schemas directly accessible to `dataAnalystAgent`.
