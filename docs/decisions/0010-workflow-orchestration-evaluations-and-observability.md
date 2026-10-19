# ADR 0010: Workflow Orchestration, Evaluations, and Observability

## Context & Problem Statement
In Milestone 10, the Autonomous Data Analyst requires an explicit, observable, and evaluated workflow connecting all foundational capabilities built across Milestones 1 through 9:
1. **End-to-End Coordination**: An analytical request requires coordinated execution across multiple stages: Dataset Schema Inspection → Business Metric Resolution → Analytical Planning → Execution Engine Selection (DuckDB / Python Sandbox) → Evidence Validation → Insight Generation → Artifact Generation (Dashboard / Report) → Response Assembly.
2. **Ambiguity & Schema Guardrails**: Ambiguous business questions (e.g. "What is our revenue?") or queries requesting metrics on datasets lacking required columns must halt cleanly and request clarification rather than blindly guessing, running arbitrary queries, or hallucinating numbers.
3. **Partial Failure Isolation**: Artifact rendering (e.g., PDF generation or Dashboard spec export) may encounter transient disk or browser failures. These downstream failures must never wipe out or invalidate successfully executed and validated analytical evidence.
4. **Observable Tracing & Privacy**: Debugging autonomous agents requires correlated execution traces tracking stages, tool durations, retry counts, schema fingerprints, and failure categories. Crucially, logs must never leak API keys, bearer tokens, passwords, or raw user PII.
5. **Deterministic Evaluation Suite**: We require an objective benchmarking harness covering all 12 key analytical requirements with exact numerical and schema assertions to prevent regressions.

---

## Architectural Decision

### 1. Explicit 8-Stage Analytical Workflow
We implement `AnalyticalWorkflowOrchestrator` (`src/lib/workflow/orchestrator.ts`) and register it as a native Mastra Workflow (`src/mastra/workflows/analytical-workflow.ts`):
- **Stage 1 (Inspection)**: Inspects schema, inferred types, row count, and computes a deterministic SHA-256 schema fingerprint.
- **Stage 2 (Semantic Resolution & Context)**: Resolves business metrics against the ASC 606 semantic catalog and retrieves corporate context citations. If ambiguous, halts with `status: 'ambiguity_clarification_needed'` and an actionable clarification prompt. If required columns are absent, halts with `status: 'incompatible_schema'`.
- **Stage 3 (Planning)**: Formulates a structured analysis plan (`AnalysisPlanSchema`) identifying target metrics, required columns, and grouping dimensions.
- **Stage 4 (Execution with Bounded Retries)**: Dispatches query execution to DuckDB or the sandboxed Python runner with bounded retries (default max 2 retries for transient errors) and timeout limits.
- **Stage 5 (Validation)**: Evaluates result non-emptiness, column coverage, and statistical constraints.
- **Stage 6 (Insight Generation)**: Generates grounded facts, hypotheses, and recommendations with explicit confidence ratings.
- **Stage 7 (Artifact Generation with Partial Failure Isolation)**: Optionally compiles interactive Dashboard specifications and renders executive HTML/PDF reports. If artifact export encounters an error, the validated analysis and insights are preserved, transitioning the workflow to `partial_success_artifact_failed` rather than aborting.
- **Stage 8 (Response Assembly)**: Compiles the final explanation, references corporate provenance citations, and finalizes the trace.

### 2. Observability & Privacy-Preserving Tracing
We implement `WorkflowTracer` (`src/lib/observability/tracer.ts`) with correlated trace IDs (`trc_<uuid>`) and run IDs (`run_<uuid>`):
- **Correlated Spans**: Each workflow stage records start/end timestamps, high-resolution duration, status (`started`, `completed`, `retrying`, `failed`, `warning`, `skipped`), and structured failure categories.
- **Sensitive Data Redaction**: `redactSensitiveData` sanitizes:
  - API keys (`sk-ant-api03-*`, `sk-proj-*`, `ghp_*`, `github_pat_*`).
  - Bearer tokens (`Bearer [REDACTED_BEARER_TOKEN]`).
  - Passwords and connection string credentials (`postgres://user:[REDACTED_PASSWORD]@host`).
  - Email addresses (`[REDACTED_EMAIL]`).
  - Prompt injection markers (`<|im_start|>...<|im_end|>`).
  - Data row previews exceeding safe limits (`[REDACTED_DATA_ROWS: X rows omitted for privacy]`).

### 3. Comprehensive Evaluation Framework
We build a reproducible evaluation suite (`src/lib/eval/runner.ts` and `npm run eval`) with 12 deterministic test fixtures:
1. **SQL Numeric Accuracy**: Evaluates exact aggregations against known sales totals.
2. **Metric Ambiguity**: Tests prompt disambiguation (Gross vs Net Revenue).
3. **Incompatible Schema**: Verifies failure to hallucinate absent columns.
4. **Python Statistical Rigor**: Verifies Student-t distribution ($t_{crit}=2.306$, $df=8$) on small samples ($n=9$) instead of naive normal approximations ($1.96$).
5. **Evidence Traceability**: Validates end-to-end trace span continuity and schema fingerprints.
6. **Correlation vs Causation**: Enforces mandatory anti-causation caveats on correlation metrics.
7. **Small Sample Communication**: Verifies warning issuance when $n < 30$.
8. **Prompt Injection Defense**: Tests excision of chat control tokens from retrieved passages.
9. **SQL Security**: Verifies AST-based rejection of destructive commands (`DROP TABLE`) and unauthorized functions.
10. **Missing Values & Outliers**: Confirms non-distorting null handling and Tukey 1.5x IQR boundaries.
11. **Dashboard & Report Generation**: Verifies valid schema generation from evidence.
12. **Failure Handling & Recovery**: Proves downstream export failures preserve analytical findings.

All evaluation results are persisted to `reports/eval-summary.json` with aggregate metrics (numerical correctness rate, evidence coverage rate, metric resolution accuracy, unsupported claim rate, tool failure rate, task completion rate).

### 4. Security & Reliability Boundary Hardening (Correction Pass)
Following targeted verification in Milestone 10, the security and reliability controls were hardened across five areas:
- **SQL Security Boundary**:
  - All queries passing from metric resolution, analytical planning, and workflow execution route strictly through `executeAnalyticalQuery` and the existing AST validator (`validateReadOnlySql`).
  - AST table verification uses both parser-level table extraction and recursive AST scanning to ensure all `FROM`, `JOIN`, and subquery sources are checked against `allowedTableAliases` (default: `['dataset']`) and local CTEs.
  - Multi-statement queries, DDL/DML operations (`DROP`, `INSERT`, `UPDATE`), filesystem readers (`read_csv`, `read_parquet`, `pg_read_file`), and unauthorized tables are rejected before DuckDB session initialization.
- **Retrieved-Context Trust Boundary**:
  - Retrieved documents, glossary text, dataset column names, dataset cell values, and user descriptions are strictly treated as untrusted data.
  - Sanitization filters (`sanitizeRetrievedText`) neutralize LLM control blocks and natural-language prompt injection phrases without special tokens.
  - Crucially, sanitization is not the sole security boundary: downstream SQL AST validation, table whitelisting, DuckDB external access lockdown (`SET enable_external_access = false;`), and subprocess credential stripping are enforced independently of prompt text.
- **Bounded Retries, Cancellation, and Process Isolation**:
  - Errors are classified via `isTransientError`: permanent failures (`SqlSecurityError`, `SqlSyntaxError`, DuckDB binder/catalog errors, schema defects, path access denials) fail immediately with 0 retries burned.
  - Only genuine transient failures (`QueryTimeoutError`, temporary resource locks) are retried up to `maxRetries` (default: 2).
  - Python worker execution supports `AbortSignal` cancellation and enforces wall-clock timeouts. Child process trees are forcefully terminated via `taskkill /pid <pid> /T /F` on Windows and `SIGKILL` on POSIX, leaving zero zombie processes.
  - Retries do not duplicate side-effects; artifact rendering occurs strictly after successful execution.
- **Trace Redaction & Persistence**:
  - Recursive scrubbing sanitizes nested objects, native `Error` instances, error messages, and stack traces.
  - Redaction covers database connection string passwords across URL styles (`postgres://`, `mongodb://`, `redis://`) and key-value formats (`Server=...;Pwd=...`), Bearer tokens, GitHub PATs, AWS access keys (`AKIA...`), Slack tokens, OpenAI/Anthropic keys (`sk-...`), emails, and credit cards.
  - Unrestricted dataset row dumps (`rows`, `rawResults`) are never persisted in traces; telemetry metadata records privacy-safe row counts (`[REDACTED_DATA_ROWS: X rows omitted for privacy]`). Unrestricted SQL parameters are scrubbed and bounded.
  - Serialized trace files (`persistTrace`) are written to `reports/traces/<traceId>.json` after complete sanitization.
  - *Known Limitation*: Heuristic and regex redaction is a defense-in-depth measure, not a comprehensive DLP engine. Operators handling regulated PII/PHI must enforce strict ingestion schemas.
- **Evaluation Reporting Transparency**:
  - Benchmark summary explicitly states that 12/12 passing cases means all 12 current deterministic fixtures passed their regression assertions; it does NOT claim or imply 100% open-domain or production accuracy.
  - Each metric explicitly reports its sample denominator (e.g. numerical correctness: 2/2 assertions in 1 fixture, evidence coverage: 3/3 assertions in 1 fixture, tool failure rate: 0/12 fixtures, task completion rate: 12/12 fixtures).

---

## Consequences

### Positive
- **Deterministic Reliability**: No step relies on unbounded model self-correction; transitions are governed by typed contracts.
- **Zero Hallucination on Ambiguity**: When questions lack specificity, the system halts cleanly and requests clarification.
- **Auditability**: Every analytical run is traceable by traceId with schema fingerprint, execution engine, and citations.
- **Privacy Compliance**: Confidential keys, database passwords, and customer PII are redacted before trace persistence.
- **Regression Prevention**: 12 deterministic benchmarks guarantee that future milestone additions cannot break core analytical correctness.

### Limitations & Non-Goals for M10
- Milestone 10 deliberately excludes multi-user session state, persistent PostgreSQL trace storage, RBAC, and distributed queues; these operational infrastructure elements belong to Milestone 11.
- Telemetry redaction is regex/pattern-based; free-text unstructured PII lacking identifiable prefixes cannot be guaranteed to be 100% detected.

