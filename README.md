# Autonomous Data Analyst

A production-oriented, TypeScript-based Autonomous Data Analyst built on the [Mastra](https://mastra.ai) agent framework. The system is designed to progressively inspect datasets, understand schemas, plan analytical investigations, execute safe SQL, run statistical analyses, detect anomalies, generate charts, validate results, and produce reproducible reports.

---

## Current Status (Milestone 12: BI Integrations and Scheduled Autonomous Analysis)

### What Works
- **BI Integrations & Scheduled Autonomous Analysis (Milestone 12, `npm run schedule:demo`, `npm run server`)**:
  - **Durable Database-Backed Scheduler**: Supports both recurring 5-field cron schedules (`minute hour day-of-month month day-of-week`) and one-time future executions backed by PostgreSQL/durable adapter (`migrations/0002_milestone12_schedules_bi.sql`).
  - **Timezone & Daylight-Saving Correctness**: Configurable with standard IANA timezones (e.g. `America/New_York`, `UTC`, `Europe/London`). Handles daylight saving spring-forward (skips invalid local hours cleanly) and fall-back (disambiguates repeated hours deterministically) via `cron-parser`.
  - **Idempotent Dispatch & Concurrency Limits**: Atomic lock prevents duplicate dispatches within execution windows. Concurrency limits protect against overlapping executions of slow recurring runs.
  - **Restart Recovery & Reconciliation**: Detects missed executions upon daemon restart and automatically reconciles next runs into the future.
  - **Scheduled Report Delivery Destinations**: Authorized delivery to HMAC-SHA256 authenticated webhooks (`X-ADA-Signature`, `X-ADA-Timestamp`) and email recipients with recipient validation.
  - **End-to-End Apache Superset BI Platform Integration**: Full API connector supporting JWT login/refresh, dataset discovery, chart publishing, and latency measurement with typed error discrimination (`BiAuthenticationError`, `BiPermissionError`, `BiRateLimitError`, `BiConnectionError`).
  - **AES-256-GCM Secret Security**: Webhook signing secrets and external BI credentials encrypted at rest, decrypted strictly in memory during dispatch, never exposed in API payloads (`hasSecret: true/false`), and stripped from logs.
  - **Schedules & BI Frontend View**: Dedicated management interface for creating schedules, monitoring run histories, managing delivery channels, and configuring Superset connections.
- **Full-Stack Application & Live Workflow Integration (Milestone 11, `npm run server`, `npm run dev:dashboard`)**:
  - Full-stack React 19 / TypeScript / Apache ECharts web application connected to live backend REST endpoints.
  - End-to-end user journey: User sign-in/registration → CSV/Parquet dataset upload and profiling → Business question submission → Background workflow execution with stage progress → Result validation & insights → Interactive dashboard rendering from generated `DashboardSpec` → Executive HTML/PDF report access → Analysis history audit.
  - Truthful dashboard slicer behavior: filter bar explicitly explains that slicers filter displayed records in the data table without falsely claiming recomputation.
  - Interactive ambiguity prompt: when natural language questions contain ambiguous metrics (e.g. gross vs. net revenue), the UI exposes the clarifying prompt and options cleanly.
- **Authentication, RBAC & Multi-Tenant Isolation (Milestone 11)**:
  - Secure authentication with `crypto.scryptSync` salted password hashing and constant-time `crypto.timingSafeEqual` comparison.
  - Explicit roles: `Admin` (manages members, datasets, analyses), `Analyst` (uploads datasets, runs analyses), `Viewer` (read-only inspection of datasets, dashboards, and reports).
  - Strict tenant scoping on every protected operation (`assertTenantScope`): prevents insecure direct-object-reference (IDOR) attacks across datasets, jobs, artifacts, and traces.
  - Token and cookie-based sessions with CSRF tokens and rate-limiting.
- **PostgreSQL Durable Persistence & Versioned Migrations (Milestone 11, `npm run migrate`)**:
  - Versioned SQL migrations (`migrations/0001_initial_schema.sql`) tracking `organizations`, `users`, `memberships`, `sessions`, `datasets`, `dataset_profiles`, `analyses`, and `artifacts`.
  - DatabaseAdapter abstraction providing `PostgresAdapter` for production deployments and `MemoryDbAdapter` for fast, hermetic, 100% offline testing.
- **Asynchronous Background Execution with BullMQ & Redis (Milestone 11)**:
  - Background queue adapter (`BullMqAnalysisQueue` for distributed Redis deployments and `InMemoryAnalysisQueue` for development/testing).
  - Explicit states: `queued`, `running`, `completed`, `failed`, `cancelled`, and `partial_success`.
  - Live stage progress updates (`inspection` 10%, `semantic_resolution` 25%, `planning` 40%, `execution` 55%, `validation` 70%, `insight_generation` 85%, `artifact_generation` 95%, `completed` 100%).
  - Bounded retries: transient timeouts retry up to 2 times, while permanent SQL errors, syntax errors, and schema mismatches fail immediately without retry.
  - Job cancellation support with `AbortController` gracefully terminating subprocesses.
- **Python Production Fail-Closed Security Boundary (Milestone 11)**:
  - Arbitrary user-supplied Python scripts (`custom_script`) FAIL CLOSED in production or multi-tenant mode unless verifiable, hardened container isolation markers (`/.dockerenv`, `/run/.containerenv`, or cgroups container ID) are verified.
  - Setting `CONTAINER_SANDBOX_ACTIVE=true` alone is strictly rejected as insufficient proof of isolation.
  - Pre-approved, parameter-driven statistical routines (`descriptive_stats`, `correlation_matrix`, etc.) continue to run safely within the restricted subprocess.
- **Explicit Analytical Workflow (Milestone 10, `npm run workflow:analyze`)**:
  - Versioned, typed Mastra Workflow (`analyticalWorkflow`) orchestrating the end-to-end analytical pipeline:
    `Dataset Inspection -> Business Metric Resolution -> Planning -> DuckDB / Python Execution -> Evidence Validation -> Insight Generation -> Dashboard/Report Generation -> Response Assembly`.
  - Granular state discrimination: `completed`, `ambiguity_clarification_needed`, `incompatible_schema`, `unresolved_exploratory`, `validation_failed`, `partial_success_artifact_failed`, `execution_error`, and `terminal_failure`.
  - Non-destructive partial failure handling: downstream artifact generation failures never erase or hallucinate over validated analytical calculations.
  - Bounded retries on transient execution failures (default max 2 retries) with strict timeout boundaries.
- **Correlated Observability & Privacy-Preserving Tracing (Milestone 10)**:
  - `WorkflowTracer` assigning correlated `traceId` (`trc_<uuid>`) and `runId` (`run_<uuid>`).
  - Stage-by-stage timing spans, retry tracking, failure categories, and SHA-256 deterministic schema fingerprinting.
  - Privacy-preserving redaction (`redactSensitiveData`): automatically redacts OpenAI, Anthropic, and GitHub API keys, Bearer tokens, database connection string passwords, email addresses, and raw data dumps.
- **Reproducible Evaluation & Benchmarking Suite (Milestone 10, `npm run eval`)**:
  - Deterministic evaluation runner executing 12 benchmark fixtures covering numerical correctness, business metric disambiguation, unsupported schemas, small-sample Student-t rigor, evidence traceability, anti-causation restraint, prompt-injection defense, read-only SQL AST safety, missing values/outliers, and failure recovery.
  - Outputs machine-readable summary reports (`reports/eval-summary.json`) tracking numerical correctness (100%), evidence coverage (100%), metric resolution accuracy (100%), unsupported claim rate (0%), and task completion rate (100%).
- **Business Semantic Layer & Grounded Domain RAG (Milestone 9, `npm run semantic:query`)**:
  - Declarative, versioned contracts ([`BusinessMetricDefinitionSchema`](file:///d:/autonomous-data-analyst/src/lib/semantic/types.ts), [`BusinessGlossaryTermSchema`](file:///d:/autonomous-data-analyst/src/lib/semantic/types.ts), [`BusinessContextDocumentSchema`](file:///d:/autonomous-data-analyst/src/lib/semantic/types.ts), [`MetricResolutionResultSchema`](file:///d:/autonomous-data-analyst/src/lib/semantic/types.ts)) under `1.0.0` with strict Zod validation.
  - Pre-seeded commerce & retail metrics conforming to accounting standards (ASC 606): Gross Revenue, Net Revenue, Average Order Value (AOV), Units Per Transaction (UPT), and Discount Penetration Rate.
  - Multi-level tenant boundary isolation (`application_wide`, `organization`, `dataset_specific`) enforced across metrics and context documents via `isScopeAccessible()`.
  - Untrusted text sanitization defense: strips LLM chat control tokens (`<|im_start|>`, `<|system|>`) and neutralizes prompt-injection instruction hijacking phrases (`system override`, `ignore previous instructions`).
  - Grounded metric resolver (`BusinessMetricResolver`):
    - Validates required source columns and compatible data types against profiled dataset schema.
    - Resolves natural-language business questions to exact SQL expressions without column hallucination.
    - Enforces metric additivity classifications (`additive`, `semi_additive`, `non_additive`) preventing summing ratios or averages across categories.
    - Detects ambiguity (e.g. Gross vs Net Revenue) and generates explicit clarifying questions without guessing.
    - Flags unapproved concepts as exploratory with mandatory warnings against presenting them as certified KPIs.
  - Registered via Mastra tools `resolveBusinessMetricTool` and `queryBusinessContextTool`, and CLI runner `npm run semantic:query`.
- **Sandboxed Python Analytics Engine (Milestone 8, `npm run python:analyze`)**:
  - Process-isolated Python statistical worker extending DuckDB with advanced analytics:
    - Descriptive distribution moments (skewness, excess kurtosis, standard error, 95% confidence intervals, and Tukey 1.5x IQR outliers).
    - Group comparisons & hypothesis testing (two-sample Welch's t-test for unequal variances, Mann-Whitney U test, Cohen's d effect size).
    - Ordinary Least Squares (OLS) linear regression modeling (slope, intercept, R², adjusted R², Pearson correlation, and p-values).
    - Multi-group variance testing via One-Way ANOVA F-tests.
    - Categorical independence testing via Chi-Square contingency table analysis.
    - Time-series trend decomposition and rolling moving averages with strict observation thresholds ($n \ge 15$).
  - Multi-tier isolation boundary:
    - Dedicated worker subprocess (`worker_runner.py`) with zero Node.js memory sharing.
    - AST / static code safety inspector rejecting forbidden syscalls (`os.system`, `subprocess`, `socket`, `urllib`, `requests`, `eval`, `exec`).
    - Environment sanitization: scrubbed process environment strictly stripping application secrets (`OPENAI_API_KEY`, etc.).
    - Ephemeral scratchpad (`reports/tmp/py_sandbox_<uuid>`) with automated cleanup.
    - Dataset path traversal containment enforcing authorized roots (`datasets/`, `data/`, `reports/`).
    - Execution bounds: default 10s timeout and 512 KB buffer limits.
    - Lazy package loading for sub-10ms startup times on standard library math/statistics tasks.
  - Refined insight generation: distinguishes descriptive operational status baselines (e.g. `payment_status = Completed`, `discount_applied = false`) from strategic commercial findings.
  - Registered via Mastra tool `runPythonAnalysisTool` and CLI runner `npm run python:analyze`.
- **Executive Business Report Generation (Milestone 7, `generateReportTool`, `npm run report`)**:
  - Declarative, versioned contract ([`ReportSpec`](file:///d:/autonomous-data-analyst/src/lib/report/types.ts)) under `1.0.0` with full Zod validation.
  - Complete executive report sections: Header & Scope, Executive Summary, Executive KPIs, Data Quality & Completeness, Ranked Strategic Findings, Inline Vector SVG Visualizations, Detailed Tabular Results, Statistical Distribution Analysis, Methodology & Provenance, and Statistical Appendix.
  - Publication-Ready Semantic HTML & Print Styling with automated HTML sanitization (`escapeHtml`).
  - Headless PDF Export via lightweight `puppeteer-core` with auto-discovery of system browsers across Windows, macOS, and Linux.
- **Native Interactive Dashboard Interface (Milestone 6, `npm run dev:dashboard`, `npm run build:dashboard`)**:
  - Standalone Power BI alternative built with React 19, TypeScript, and Apache ECharts.
  - KPI cards, dynamic charts (bar, donut, line, scatter, histogram), interactive slicers, paginated data table, and correlation matrix.
- **Embedded DuckDB Analytical Execution (Milestones 4 & 5, `npm run query`, `npm run eda`)**:
  - In-process analytical SQL engine using DuckDB (v1.4.4) over CSV and Parquet files.
  - Double-layer security sandbox: AST read-only validation (`node-sql-parser`) and `SET enable_external_access = false;`.
  - Automated EDA engine: exact quantiles, Tukey IQR outlier detection, temporal trends, Pearson correlations with causation caveats.
- **Safe Dataset Profiling & Verification (Milestones 1–3, `npm run profile`)**:
  - Streaming CSV profiler with path traversal defense, file size limits, reservoir sampling, analytical planning contracts, and domain-aware result validation.
- **Comprehensive Verification Suite**:
  - 48 test suites, 333 tests passing deterministically via Vitest (`npm test`).
  - Clean TypeScript typecheck (`npm run typecheck` — 0 errors).
  - Clean Mastra backend build (`npm run build`).
  - Clean Vite frontend dashboard build with route-level code splitting (`npm run build:dashboard`).
  - Automated evaluation harness with 12/12 passing benchmark fixtures (`npm run eval`).
  - End-to-end analytical workflow runner (`npm run workflow:analyze`).
  - Scheduled Autonomous BI CLI verification (`npm run schedule:demo`).
  - Database schema migration verification (`npm run migrate`).
  - Complete Batch 1–5 architectural refactoring with zero source files > 800 lines.

### Current Limitations
- **In-Memory Agent State**: Default in-memory store is used in dev/test; durable PostgreSQL storage belongs to Milestone 11.
- **Single-Tenant / Standalone CLI & Local UI**: Multi-user isolation, RBAC, and background queue workers belong to Milestone 11.
- **Workstation vs Production Sandbox**: Developer workstation runs process isolation with AST validation and environment scrubbing; production deployments require containerized sandboxes (gVisor/Docker).

---

## Architecture Summary

```
autonomous-data-analyst/
├── datasets/                            # Authorized dataset repository
│   └── sample_sales.csv                 # Sample dataset fixture
├── src/
│   ├── mastra/
│   │   ├── index.ts                     # Main Mastra instance & tool/agent registry
│   │   ├── agents/
│   │   │   └── data-analyst-agent.ts    # Data Analyst Agent with analytical principles
│   │   ├── tools/
│   │   │   ├── profile-dataset-tool.ts         # Full statistical profiling tool
│   │   │   ├── inspect-dataset-tool.ts         # Lightweight schema & quality inspection
│   │   │   ├── preview-dataset-tool.ts         # Bounded record preview tool (head/tail/sample)
│   │   │   ├── formulate-analysis-plan-tool.ts # Structured analytical plan contract tool
│   │   │   ├── resolve-business-metric-tool.ts # Corporate semantic layer & metric resolver tool
│   │   │   ├── query-business-context-tool.ts  # Authoritative business context & policy RAG tool
│   │   │   ├── execute-analytical-query-tool.ts# Safe DuckDB SQL execution tool
│   │   │   ├── run-automated-eda-tool.ts       # Automated EDA & business insights tool
│   │   │   ├── generate-dashboard-spec-tool.ts # Declarative DashboardSpec generator tool
│   │   │   ├── generate-report-tool.ts         # Executive business report generator (HTML & PDF)
│   │   │   ├── run-python-analysis-tool.ts     # Sandboxed Python statistical analysis tool
│   │   │   └── validate-analysis-result-tool.ts# Result verification contract tool
│   │   └── workflows/                   # Multi-stage analysis workflows (Milestone 10)
│   ├── lib/
│   │   ├── semantic/
│   │   │   ├── types.ts                 # Versioned semantic contracts & Zod schemas (1.0.0)
│   │   │   ├── registry.ts              # Governed metric catalog & corporate policy documents
│   │   │   ├── retrieval.ts             # Traceable context retrieval with prompt-injection defense
│   │   │   └── resolver.ts              # Schema-grounded metric resolver & ambiguity detector
│   │   ├── analytics/
│   │   │   ├── types.ts                 # SQL execution types & Zod contracts
│   │   │   ├── sql-validator.ts         # AST read-only SQL validator & table allowlist
│   │   │   ├── duckdb-engine.ts         # Sandboxed in-memory DuckDB query runner
│   │   │   ├── eda-types.ts             # Versioned Zod schemas for EDA & insights
│   │   │   ├── eda-engine.ts            # Automated exploratory analysis via DuckDB
│   │   │   ├── eda-profilers.ts         # Numeric, categorical, datetime profilers
│   │   │   ├── eda-helpers.ts           # Type classification & normalization helpers
│   │   │   └── insight-generator.ts     # Evidence-backed ranked business insight generator
│   │   ├── dashboard/
│   │   │   ├── types.ts                 # Declarative DashboardSpec Zod schemas & types
│   │   │   ├── generator.ts             # Deterministic dashboard spec generator engine
│   │   │   ├── builders.ts              # KPI and layout specification builders
│   │   │   └── chart-builders.ts        # Modular chart specification builders (bar, donut, scatter, etc.)
│   │   ├── report/
│   │   │   ├── types.ts                 # Versioned ReportSpec Zod schemas & types (1.0.0)
│   │   │   ├── generator.ts             # Grounded report spec generator from EDA results
│   │   │   ├── report-spec-builders.ts  # Modular section spec builders
│   │   │   ├── html-renderer.ts         # Semantic HTML renderer with print styles & SVG charts
│   │   │   ├── report-sections.ts       # HTML section renderers (KPIs, findings, tables, appendix)
│   │   │   ├── report-styles.ts         # Publication-grade CSS stylesheet template
│   │   │   ├── svg-charts.ts            # Server-rendered inline SVG visualizations
│   │   │   └── pdf-generator.ts         # Headless browser PDF exporter via puppeteer-core
│   │   ├── dataset/
│   │   │   ├── types.ts                 # Dataset profile Zod schemas & TypeScript types
│   │   │   ├── validator.ts             # Path traversal defense & file size validation
│   │   │   ├── profiler.ts              # Streaming CSV parser & statistical engine
│   │   │   ├── cache.ts                 # In-memory profile cache with mtime invalidation
│   │   │   ├── preview.ts               # Bounded preview with reservoir sampling
│   │   │   ├── plan.ts                  # Schema-grounded plan contract generator
│   │   │   └── validation.ts            # Domain-aware result validator
│   │   ├── db/
│   │   │   ├── types.ts                 # Database schemas, domain entities, repository contracts
│   │   │   ├── adapter.ts               # High-level database adapter factory
│   │   │   ├── memory-adapter.ts        # Hermetic in-memory store for offline/test environments
│   │   │   ├── postgres-adapter.ts      # Production PostgreSQL client implementing all 26 repository operations
│   │   │   ├── postgres-helpers.ts      # Parameterized query builders & DDL migration definitions
│   │   │   └── repositories/            # Entity repositories (users, orgs, datasets, analyses, schedules, etc.)
│   │   ├── workflow/
│   │   │   ├── orchestrator.ts          # Multi-stage workflow orchestrator & state machine
│   │   │   ├── stage-execution.ts       # Modular step runners (inspection, execution, validation, insights)
│   │   │   └── error-classifier.ts      # Transient vs. permanent error classification & retry policies
│   │   └── python/
│   │       ├── types.ts                 # Python analysis request/result/provenance Zod contracts
│   │       ├── sandbox-runner.ts        # Subprocess manager & capability coordinator
│   │       ├── security-validator.ts    # AST pre-execution safety inspector (blocks os, subprocess, socket)
│   │       ├── isolation.ts             # Container sandbox probe & fail-closed production boundary
│   │       ├── worker-lifecycle.ts      # Ephemeral workspace isolation, timeout termination, secret scrubbing
│   │       └── worker_runner.py         # Isolated Python worker with Student's t critical values & stats
│   ├── server/
│   │   ├── index.ts                     # HTTP server entry point & middleware pipeline
│   │   ├── helpers.ts                   # Error response formatting, auth extraction, route utilities
│   │   ├── types.ts                     # Server configuration & HTTP context definitions
│   │   └── routes/                      # Modular route handlers (auth, dataset, analysis, scheduler, bi, etc.)
│   ├── frontend/
│   │   ├── main.tsx                     # React 19 application entry point
│   │   ├── App.tsx                      # Root shell with top navigation, auth state, and lazy routing
│   │   ├── sample-spec.ts               # Pre-compiled DashboardSpec artifact for demo
│   │   ├── styles.css                   # Glassmorphic dark theme, responsive grid
│   │   └── components/
│   │       ├── TopNavBar.tsx            # Global header, user profile, role badge, session status
│   │       ├── DashboardView.tsx        # Dynamic dashboard with KPIs, ECharts, slicers, and data table
│   │       ├── DatasetsView.tsx         # Dataset upload, schema profiling, and column inspection
│   │       ├── AnalyzeView.tsx          # Business question submission, ambiguity modal, progress tracker
│   │       ├── HistoryView.tsx          # Execution history, stage telemetry, and artifact access
│   │       ├── SchedulesBiView.tsx      # Recurring schedules, webhook delivery channels, Superset BI sync
│   │       ├── AuthView.tsx             # Multi-tenant login & organization registration forms
│   │       ├── KpiCard.tsx              # Executive KPI headline metrics
│   │       ├── EChartsChart.tsx         # Apache ECharts wrapper (bar/donut/line/scatter/hist)
│   │       ├── FilterBar.tsx            # Real-time interactive slicers
│   │       ├── DataTable.tsx            # Multi-column sorting, search, and pagination
│   │       ├── InsightsPanel.tsx        # Fact/hypothesis/recommendation cards
│   │       └── CorrelationView.tsx      # Pairwise correlation matrix & caution alerts
│   ├── config/
│   │   └── env.ts                       # Environment variable validation via Zod
│   └── scripts/
│       ├── profile-dataset-cli.ts       # Offline CLI profiling runner
│       ├── query-cli.ts                 # DuckDB SQL analytical runner
│       ├── eda-cli.ts                   # Automated EDA & business insights CLI runner
│       ├── generate-dashboard-cli.ts    # DashboardSpec artifact & demo generator
│       ├── generate-report-cli.ts       # Executive business report CLI runner (HTML & PDF)
│       ├── python-analysis-cli.ts       # Python statistical analysis CLI runner
│       ├── semantic-query-cli.ts        # Business semantic resolution & domain RAG CLI runner
│       └── smoke-test.ts                # Non-destructive live test harness
├── tests/
│   ├── config/
│   │   └── env.test.ts                  # Config & secret validation tests
│   ├── lib/
│   │   ├── validator.test.ts            # Path traversal & security tests
│   │   ├── profiler.test.ts             # Profiler statistical accuracy tests
│   │   ├── preview.test.ts              # Preview modes & column projection tests
│   │   ├── plan.test.ts                 # Analytical plan contract tests
│   │   ├── validation.test.ts           # Result validation & reconciliation tests
│   │   ├── sql-validator.test.ts        # AST parser SQL validation tests
│   │   ├── duckdb-engine.test.ts        # DuckDB engine execution & sandboxing tests
│   │   ├── eda-engine.test.ts           # Automated EDA distributions, trends & correlations
│   │   ├── insight-generator.test.ts    # Ranked evidence-backed insights & fact/hypothesis tests
│   │   ├── dashboard-spec.test.ts       # DashboardSpec schema validation & guardrails
│   │   ├── dashboard-generator.test.ts  # Dashboard generator & empty dataset handling
│   │   ├── report-spec.test.ts          # ReportSpec schema invariants & constraint tests
│   │   ├── report-generator.test.ts     # Report generator, traceability & XSS tests
│   │   ├── report-renderer-and-pdf.test.ts # HTML rendering & actual PDF binary export tests
│   │   ├── python-sandbox-security.test.ts # Python isolation, capability checks & secret scrubbing
│   │   ├── python-statistical-analysis.test.ts # Python numerical stats, ANOVA, OLS, Chi-Square
│   │   ├── python-types-and-validation.test.ts # Python Zod schemas & contract enforcement
│   │   ├── semantic-layer.test.ts       # Metric resolution, schema grounding & ambiguity tests
│   │   └── semantic-retrieval.test.ts   # Context retrieval, citations & scope boundary tests
│   └── mastra/
│       ├── agent.test.ts                # Agent identity & instruction invariant tests
│       ├── registration.test.ts         # Mastra instance registration tests
│       ├── tool.test.ts                 # Profile dataset tool tests
│       ├── milestone3-tools.test.ts     # Milestone 3 tools & agent registry tests
│       ├── milestone4-execution-tool.test.ts # Milestone 4 DuckDB tool tests
│       ├── milestone5-eda-tool.test.ts  # Milestone 5 EDA Mastra tool tests
│       ├── milestone6-dashboard-tool.test.ts# Milestone 6 Dashboard Mastra tool tests
│       ├── milestone7-report-tool.test.ts # Milestone 7 Executive Report Mastra tool tests
│       ├── milestone8-python-tool.test.ts # Milestone 8 Python Analytics Mastra tool tests
│       └── milestone9-semantic-tools.test.ts # Milestone 9 Semantic Layer & Context Mastra tool tests
├── docs/
│   ├── architecture.md                  # Comprehensive architectural specification
│   ├── roadmap.md                       # Product vision & revised 12-milestone roadmap
│   └── decisions/
│       ├── 0001-mastra-as-primary-agent-framework.md        # ADR 0001
│       ├── 0002-streaming-dataset-profiling-engine.md       # ADR 0002
│       ├── 0003-dashboard-and-reporting-strategy.md         # ADR 0003
│       ├── 0004-duckdb-analytical-execution-and-sandboxing.md# ADR 0004
│       ├── 0005-automated-eda-and-evidence-backed-insights.md# ADR 0005
│       ├── 0006-declarative-dashboard-spec-and-echarts-renderer.md # ADR 0006
│       ├── 0007-executive-report-generation-and-pdf-export.md      # ADR 0007
│       ├── 0008-sandboxed-python-analytics.md               # ADR 0008
│       ├── 0009-business-context-and-semantic-layer.md      # ADR 0009
│       └── 0010-workflow-orchestration-evaluations-and-observability.md # ADR 0010
├── .env.example                         # Safe configuration template
├── .gitignore                           # Git ignore rules protecting secrets and artifacts
├── package.json                         # Dependencies and lifecycle scripts
├── tsconfig.json                        # Strict NodeNext TypeScript configuration
└── README.md
```

Detailed design and security boundaries are documented in [docs/architecture.md](docs/architecture.md).

---

## Prerequisites

- **Node.js**: v20.x or v22.x (Recommended: Node.js >= 22.13.0)
- **Package Manager**: `npm` (v10+) or `pnpm` (v10+)
- **OpenAI API Key**: Required only for live model calls (optional for offline testing, CLI profiling, and static verification).

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Navaneethvarma/autonomous-data-analyst.git
   cd autonomous-data-analyst
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if you plan to execute live LLM model invocations:
   ```env
   OPENAI_API_KEY=sk-...
   MODEL_NAME=openai/gpt-4o
   DATASETS_DIR=./datasets
   MAX_DATASET_SIZE_MB=50
   NODE_ENV=development
   ```

---

## Development & Verification Commands

| Command | Description |
|---|---|
| `npm run server` | Launches the production REST API backend server on `http://localhost:3001` |
| `npm run dev:dashboard` | Launches the interactive React + Apache ECharts dashboard on `http://localhost:5173/` |
| `npm run migrate` | Applies PostgreSQL database migrations from `migrations/0001_initial_schema.sql` |
| `npm test` | Runs the automated Vitest test suite (236 tests across 40 files, 100% offline and hermetic) |
| `npm run eval` | Runs the 12-case analytical quality & business correctness deterministic evaluation suite |
| `npm run workflow:analyze` | Executes the end-to-end analytical workflow CLI demonstration with traces and redaction |
| `npm run semantic:query` | Demonstrates corporate semantic layer resolution, domain RAG, and ASC 606 accounting checks |
| `npm run python:analyze` | Demonstrates isolated Python statistical execution (Student-t, Welch t-test, regression, moments) |
| `npm run report` | Generates an executive business report in semantic HTML and downloadable PDF formats for `sample_sales.csv` |
| `npm run dashboard:demo` | Generates a validated DashboardSpec and artifacts (`sample_sales_dashboard.json`) for `sample_sales.csv` |
| `npm run dev:dashboard` | Launches the interactive React + Apache ECharts dashboard on `http://localhost:5173/` |
| `npm run build:dashboard` | Compiles the production frontend bundle into `dist/client/` using Vite |
| `npm run eda` | Performs automated Exploratory Data Analysis (EDA) and synthesizes ranked business insights on `sample_sales.csv` via DuckDB |
| `npm run eda <path>` | Performs automated EDA and business insight generation on any authorized `.csv` or `.parquet` dataset |
| `npm run query` | Demonstrates DuckDB analytical SQL execution on `sample_sales.csv` with grouping, aggregations, and provenance metadata |
| `npm run profile` | Profiles `sample_sales.csv` offline and outputs detailed schema, distributions, and quality warnings |
| `npm run profile <path>` | Profiles any specified `.csv` dataset within the authorized datasets directory |
| `npm run typecheck` | Runs TypeScript compiler checks without emitting files (`tsc --noEmit`) |
| `npm run build` | Builds the Mastra application bundle into `.mastra/output/` |
| `npm run dev` | Starts Mastra local development server and Mastra Studio at `http://localhost:4111` |
| `npm run smoke-test` | Runs the live OpenAI agent smoke test (requires valid `OPENAI_API_KEY`) |

---

## Security Notes

1. **Path Traversal Protection**: Filesystem access is strictly sandboxed to `DATASETS_DIR`. Requests attempting relative escapes (`..`), symlinks pointing outside, or unauthorized paths are rejected with a sanitized error.
2. **DuckDB Engine Lockdown**: Materializes datasets into RAM and executes `SET enable_external_access = false;`, disallowing external filesystem reads, network calls, and extension installation.
3. **AST Read-Only SQL Validation**: Lexical tokens and AST structure are validated prior to execution, rejecting mutations (`INSERT`, `UPDATE`, `DELETE`, `DROP`), multiple statements, and unauthorized table references.
4. **Declarative Dashboard Guardrails**: Dashboards are pure validated JSON contracts (`DashboardSpec`), preventing arbitrary JavaScript or HTML execution in the browser. Enforces strict limits: max 16 charts, 8 KPIs, 5,000 points/chart, and 1,000 table rows.
5. **Report Sanitization & Injection Defense**: All dataset labels, text, and computed attributes in HTML reports are escaped with strict HTML entity encoding. Headless browser PDF generation operates locally without external network access.
6. **Secret Protection**: API keys are validated at runtime boundaries and never logged or serialized.
7. **Memory Guardrails**: High-cardinality distinct sets and record previews are bounded (max 100 rows) to prevent denial-of-service memory exhaustion.
8. **Python Analytics Security Boundary & Threat Model**:
   - **Workstation Restricted Subprocess vs Production Sandbox**: Developer workstation execution runs in a restricted subprocess with stripped credentials (`OPENAI_API_KEY` and secrets removed), ephemeral scratchpad directories, timeout caps (10s), and buffer limits.
   - **AST Filter Limitations**: Static AST validation and token inspection are defense-in-depth pre-filters, **not a complete security sandbox**. Static parsing alone does not prevent all dynamic introspection or sandbox escapes. Arbitrary untrusted Python is **not** presented as production-safe on developer workstations.
   - **Production Isolation Capability Check**: In production (`NODE_ENV=production`) or strict container mode (`PYTHON_SANDBOX_MODE=strict_container_only`), untrusted custom scripts (`custom_script`) strictly require verified container isolation (`CONTAINER_SANDBOX_ACTIVE=true`). If container isolation is unavailable, execution is rejected rather than silently falling back to the workstation subprocess.
   - **Statistical Defensibility**: Confidence intervals use Student's t critical values ($df = n - 1$) for small samples. Results explicitly document that confidence intervals do not resolve underlying non-normality, sample dependence, selection bias, or outlier distortion.

---

## Development Roadmap

See the comprehensive [Product Vision & Detailed Roadmap](docs/roadmap.md) for full milestone definitions and architectural breakdowns.

- [x] **Milestone 1: Working Mastra Agent Foundation**
  - Mastra setup, typed agent configuration, analytical grounding instructions, registration, environment validation, unit tests.
- [x] **Milestone 2: Safe Dataset Profiling**
  - Streaming CSV inspection, empirical type inference, missing-value diagnostics, duplicate detection, summary statistics, quality warnings, Mastra tool registration.
- [x] **Milestone 3: Dataset Interaction & Analytical Contracts**
  - Focused tools (`inspect_dataset`, `preview_dataset`, `formulate_analysis_plan`, `validate_analysis_result`) with typed Zod schemas.
- [x] **Milestone 4: Reliable Analytical Execution (DuckDB)**
  - Embedded DuckDB SQL engine, read-only AST parser validation, aggregations, KPIs, CSV & Parquet support, and resource limits.
- [x] **Milestone 5: Exploratory Data Analysis & Automated Insights**
  - Full-dataset statistical distributions, IQR outlier detection, categorical concentration, temporal trend trajectories, Pearson correlations with causation caveats, ranked evidence-backed business insights, and `runAutomatedEdaTool`.
- [x] **Milestone 6: Interactive Dashboard Generation (Power BI Alternative)**
  - Declarative JSON dashboard specifications (`DashboardSpec`), executive KPI cards, adaptive charts (bar, donut, line with anomaly markers, histogram with outlier bounds, scatter), interactive slicers, correlation matrix, data table, React 19 + Apache ECharts frontend, and `generateDashboardSpecTool`.
- [x] **Milestone 7: Executive Business Report Generation (HTML & PDF Export)**
  - Declarative report specification (`ReportSpec`), executive summary, KPI scorecards, data quality assessment, ranked findings (fact vs hypothesis vs action), vector SVG print charts, statistical correlation/outlier sections with non-causation notices, methodology, print stylesheets, headless PDF export via `puppeteer-core`, and `generateReportTool`.
- [x] **Milestone 8: Sandboxed Python Analytics & Statistical Rigor** (Current)
  - Isolated Python worker (`worker_runner.py`), environment secret scrubber, AST safety filter, production isolation capability check, Student's t critical value 95% confidence intervals, Welch's t-test, Cohen's d effect size, OLS linear regression, One-Way ANOVA, Chi-Square independence, time-series forecasting, small-sample edge-case validation, and `runPythonAnalysisTool`.
- [ ] **Milestone 9: Business Context & Semantic Layer** (Next Milestone)
  - Metric definitions, business dictionaries, and grounded contextual retrieval (RAG).
- [ ] **Milestone 10: Workflow Orchestration & Quality**
  - Multi-stage Mastra workflows, bounded retries, evaluation datasets, and observability tracing.
- [ ] **Milestone 11: Production Application**
  - Next.js fullstack UI, user auth, RBAC, dataset isolation, persistent history, and background job queue.
- [ ] **Milestone 12: Enterprise BI Integrations & Scheduled Analysis**
  - Optional Apache Superset/Metabase export, scheduled recurring reports, and external warehouse connectors.
