# 0012. BI Integrations and Scheduled Autonomous Analysis

Date: 2026-10-19
Status: Accepted

## Context

Following the establishment of multi-tenant persistence, background asynchronous execution, and fail-closed Python isolation in Milestone 11, the Autonomous Data Analyst requires recurring execution capabilities to serve enterprise business intelligence workflows.

Milestone 12 addresses:
1. **Durable Scheduling**: Replacing ad-hoc or in-memory timers with a durable, database-backed scheduling engine supporting recurring cron and one-time executions.
2. **Timezone and DST Correctness**: Supporting IANA timezones and guaranteeing deterministic next-run scheduling through daylight saving transitions (spring forward, fall back).
3. **Idempotency, Concurrency & Recovery**: Preventing duplicate runs, handling node restarts, reconciling missed executions, and guarding against overlapping executions of the same schedule.
4. **Scheduled Report Delivery**: Delivering validated analysis reports and dashboards to authorized channels (email recipients and HMAC-SHA256 authenticated webhooks) with strict tenant isolation and encrypted secrets.
5. **BI Platform Integration**: Providing an end-to-end integration with Apache Superset featuring connection testing, dataset discovery, chart publishing, JWT authentication, and typed error handling.
6. **Security & Redaction**: Ensuring secrets (passwords, tokens, HMAC keys) are encrypted via AES-256-GCM at rest, never leaked in API payloads or logs, and that cross-tenant access attempts fail closed.

## Decisions

### 1. Database-Backed Scheduler Architecture & Dual-Engine Persistence
- **State Persistence**: Added tables `schedules`, `schedule_runs`, `delivery_destinations`, `bi_connections`, and `audit_logs` in PostgreSQL migration `migrations/0002_milestone12_schedules_bi.sql`.
- **Durable Polling Daemon**: Replaces in-memory timers with `SchedulerDaemon`, which polls durable storage at a configurable interval (`SCHEDULER_POLL_INTERVAL_MS`).
- **Idempotent Dispatch**:
  - Uses an atomic execution lock pattern: checks active runs and dispatches a single run with a deterministic `idempotencyKey` (`schedule:{id}:{scheduledFor}`).
  - Duplicate dispatch attempts within the same time window are rejected cleanly.
- **Overlap & Concurrency Protection**:
  - `activeRunsCount` is checked against `concurrencyLimit` (default: 1 concurrent run per schedule). If a previous run is still in `running` status, new runs are skipped with an audit log to prevent resource exhaustion.
- **Restart Recovery**:
  - On daemon startup, missed executions (`nextRunAt <= now` while `status = 'active'`) are detected. Missed executions are reconciled by immediately enqueuing a run and recalculating `nextRunAt` into the future.
  - Stale `running` runs from crashed instances are safely transitioned to `failed` after configurable timeout periods.

### 2. Timezone & Daylight Saving Time (DST) Handling
- Uses `cron-parser` configured with IANA timezone strings (e.g., `America/New_York`, `UTC`, `Asia/Kolkata`, `Europe/London`).
- Supports standard 5-field cron syntax (`minute hour day-of-month month day-of-week`) and ISO timestamps for one-time schedules.
- **Spring Forward (DST start)**: When local clock skips 02:00 -> 03:00, schedules between 02:00 and 02:59 advance to the next valid local execution time without crashing or skipping weeks.
- **Fall Back (DST end)**: When local clock repeats 01:00 -> 01:00, the parser deterministically disambiguates the next instance without executing duplicate runs.
- Validation rejects non-existent or invalid IANA timezones upfront.

### 3. Report Delivery Engine & Secret Protection
- **Multi-Tenant Delivery Destinations**:
  - Supports `webhook` and `email` destinations scoped to `organizationId`.
  - Secret credentials (webhook HMAC secret, email tokens) are encrypted with AES-256-GCM using `ENCRYPTION_KEY`.
  - Stored encrypted in the database; decrypted strictly in memory at dispatch time.
  - API responses never return secrets, returning `hasSecret: true/false` and masked identifiers.
- **HMAC-SHA256 Webhook Signatures**:
  - Outgoing webhook payloads include headers:
    - `X-ADA-Delivery-Id`: Unique delivery UUID.
    - `X-ADA-Timestamp`: Millisecond timestamp.
    - `X-ADA-Signature`: `sha256=<hex_hmac>` calculated over timestamp + "." + JSON payload.
- **Email Delivery**:
  - Authorized recipient email validation with RFC regex checks.
  - Tenant boundary prevents delivering to recipients or webhooks not registered to the schedule's tenant.
- **Audit Logging**:
  - Every schedule creation, update, deletion, pause, resume, and execution attempt is recorded with tenant ID, user ID, action, and sanitized metadata.

### 4. End-to-End Apache Superset BI Platform Integration
- **Selected Platform**: Apache Superset was prioritized as the open-source, API-accessible BI standard.
- **Authentication**:
  - Implements Superset `/api/v1/security/login` returning in-memory JWT access and refresh tokens.
  - Tokens are refreshed dynamically upon expiry (`BiAuthenticationError`).
- **Connection Validation**:
  - `testConnection()` invokes `/api/v1/dataset/` to verify reachability, credential validity, and measure latency (ms).
- **Dataset Discovery**:
  - Discovers existing physical and virtual datasets via `/api/v1/dataset/?q=...` returning IDs, table names, schemas, and column metadata.
- **Chart Publishing**:
  - Exports validated analytical metrics and visualization configurations directly to Superset `/api/v1/chart/` with ECharts/Superset visualization specifications (`slice_name`, `viz_type`, `params`).
- **Typed Error Hierarchy**:
  - Clear mapping to `BiAuthenticationError`, `BiPermissionError`, `BiRateLimitError`, and `BiConnectionError`.
- **Credential Rotation**:
  - Seamlessly re-encrypts updated credentials and revokes in-memory cached tokens.

### 5. Multi-Tenant IDOR Protection & RBAC
- All schedule, delivery, and BI endpoints verify active session organization ownership.
- Attempting to inspect or modify another tenant's schedule, delivery channel, or BI connection yields `403 Forbidden` (`CrossTenantAccessError`).
- Role-based permissions:
  - `Admin`: Full control over schedules, delivery channels, and BI platform connections.
  - `Analyst`: Create and execute schedules, publish to BI platforms.
  - `Viewer`: Read schedules and execution histories only.

## Consequences

- Scheduled analyses run reliably in recurring production environments without human intervention.
- Analytical results and dashboards are seamlessly pushed to external stakeholders via signed webhooks and BI charts.
- Zero plaintext credential leakage in databases, logs, error traces, or network API responses.
- Full compliance with existing DuckDB read-only SQL validation and fail-closed Python sandbox security boundaries.
