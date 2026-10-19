# 0011. Production Application, Secure Persistence, and Live Workflow Integration

Date: 2026-10-18
Status: Accepted

## Context

Prior milestones established the analytical foundation of the Autonomous Data Analyst: streaming EDA, read-only DuckDB execution, declarative ECharts dashboards, executive HTML/PDF report generators, sandboxed Python statistical workers, business semantic layers, and correlated workflow observability.

To transform this system into a multi-user, production-ready enterprise application, Milestone 11 addresses:
1. **Frontend-to-Backend Integration**: Connecting the React/TypeScript/ECharts user interface to real REST endpoints and the analytical workflow orchestrator.
2. **Authentication & Tenant Isolation**: Establishing a hardened multi-tenant organization boundary with explicit roles (`Admin`, `Analyst`, `Viewer`), secure cookie/bearer sessions, constant-time `scrypt` password hashing, and anti-IDOR checks on every access.
3. **Durable Persistence**: Migrating application metadata, memberships, datasets, analysis runs, and artifact registries to PostgreSQL while maintaining DuckDB for analytical computation.
4. **Asynchronous Background Execution**: Moving long-running analytical workflows to BullMQ/Redis with in-memory durable queue fallback, stage progress reporting, bounded retries on transient errors, and cancellation support.
5. **Python Isolation Hardening**: Enforcing fail-closed behavior for arbitrary user-supplied Python code in production or multi-tenant mode, rejecting reliance on `CONTAINER_SANDBOX_ACTIVE=true` alone without physical container runtime verification.

## Decisions

### 1. Dual-Engine Architecture: PostgreSQL for State, DuckDB for Analytics
- **Application Metadata & Workflow History**: Managed in PostgreSQL using versioned SQL migrations (`migrations/0001_initial_schema.sql`). Tracks `organizations`, `users`, `memberships`, `sessions`, `datasets`, `dataset_profiles`, `analyses`, and `artifacts`.
- **Analytical Execution**: Remains strictly on DuckDB in-memory engine and restricted Python workers. Raw dataset tables and parquet files are NOT duplicated as relational rows in PostgreSQL.
- **Hermetic Testing**: A `DatabaseAdapter` interface abstraction provides both `PostgresAdapter` (with migration runner) and `MemoryDbAdapter` (for 100% offline, hermetic unit/integration tests).

### 2. Multi-Tenant Organization Boundary and RBAC
- **Tenant Scope**: Every resource (dataset, profile, analysis, job, artifact) is strictly bound to an `organization_id`.
- **Identity Derivation**: Identity and active tenant are derived solely from the cryptographically verified session token (`SHA-256` token hash). Client-supplied tenant IDs or role claims are never trusted.
- **Roles & Permissions**:
  - `Admin`: Manage organization memberships, upload/delete datasets, submit analyses, cancel jobs, download artifacts.
  - `Analyst`: Upload datasets, submit analyses, cancel jobs, download artifacts.
  - `Viewer`: Read authorized datasets, inspect completed results/dashboards, download reports. Mutating actions are rejected with 403 Forbidden.
- **IDOR Defense**: All routes enforce `assertTenantScope(sessionOrgId, resourceOrgId)`. Cross-tenant attempts throw `CrossTenantAccessError` resulting in 403 Forbidden.

### 3. Server-Controlled Dataset Storage & Path Traversal Containment
- Files are stored in tenant-isolated directories: `datasets/tenants/<orgId>/<uuid>.<ext>`.
- Client-supplied filenames are sanitized; physical storage paths are server-controlled UUIDs outside web-accessible roots.
- Raw filesystem paths are stripped from API responses to prevent server directory leakage.
- Format is restricted to `.csv` and `.parquet` with 50MB upload limits. Incomplete uploads are cleaned up atomically.

### 4. Background Execution Lifecycle with BullMQ & In-Memory Fallback
- Requests submit analysis jobs asynchronously returning `202 Accepted` with `analysisId` and `jobId`.
- Queue payloads contain only references (`analysisId`, `organizationId`, `userId`, `datasetId`, `userQuery`); never raw database rows, credentials, or secrets.
- Workflow execution updates stages (`inspection` -> `semantic_resolution` -> `planning` -> `execution` -> `validation` -> `insight_generation` -> `artifact_generation` -> `completed`) and percent progress (0% to 100%).
- Retries are bounded to max 2 attempts and strictly governed by `isTransientError()`. Permanent errors (SQL syntax, security violations, schema mismatches, validation failures) halt immediately without burning retries.
- Cancellation via `AbortController` cleanly terminates running worker subprocesses and updates job state to `cancelled`.

### 5. Production Python Fail-Closed Boundary & Hardened Isolation Assessment
- Container markers such as `/.dockerenv`, `/run/.containerenv`, or cgroups strings do NOT, by themselves, constitute proof of an authorized hardened sandbox.
- In production mode (`NODE_ENV === 'production'`) or multi-tenant mode (`MULTI_TENANT_MODE === 'true'`), arbitrary user-supplied Python scripts (`custom_script`) FAIL CLOSED unless the complete hardened sandbox contract is verified:
  1. Container runtime marker (cgroups or container runtime probe).
  2. Non-root user execution (`process.getuid() !== 0` on POSIX).
  3. Network egress disabled (`PYTHON_CONTAINER_NETWORK_DISABLED=true` or `SANDBOX_NETWORK_EGRESS=none`).
  4. Restricted root filesystem policy (`PYTHON_CONTAINER_READONLY_ROOT=true`).
  5. Operator confirmation flag (`PYTHON_HARDENED_SANDBOX_VERIFIED=true` or `CONTAINER_SANDBOX_ACTIVE=true`).
- Setting `CONTAINER_SANDBOX_ACTIVE=true` alone or simple container markers without the required isolation policies fails closed with an explicit operational rejection.
- Pre-approved, parameter-driven statistical routines (`descriptive_stats`, `correlation_matrix`, `linear_regression`, `hypothesis_test`) continue to execute safely within the restricted subprocess using pre-generated templates.

### 6. Production Dependency Fail-Closed Enforcement
- In production, PostgreSQL is mandatory for application durability; missing `DATABASE_URL` or attempting in-memory storage immediately fails closed with a clear configuration error.
- Redis/BullMQ is mandatory for background worker execution in production; missing `REDIS_URL` or attempting in-memory queues fails closed. In-memory adapters remain permitted only in development and hermetic unit/integration tests.
- Connection strings are sanitized via `sanitizeConnectionString` so passwords are never exposed in logs or operational error responses.

### 7. Authentication, Session Security & CSRF
- Password hashing uses asynchronous `crypto.scrypt` via `util.promisify` to avoid blocking the Node.js event loop under concurrent load.
- Session tokens are stored hashed (SHA-256) in the database. Cookies are configured with `HttpOnly; SameSite=Strict; Path=/` and `; Secure` in production.
- Session expiration is verified on every request; expired sessions are deleted and rejected.
- Revocation is supported via `authService.logout` and `revokeAllUserSessions(userId)`.
- CSRF validation is enforced on all cookie-authenticated state-changing requests (`POST`, `PUT`, `DELETE`) using constant-time `crypto.timingSafeEqual`.
- Dedicated login rate limiting (max 5 attempts/minute per IP) defends against brute-force attacks.

### 8. Worker Dataset Verification & Queue Idempotency
- Background workers independently resolve and authorize datasets from the database (`db.getDatasetById(payload.datasetId, payload.organizationId)`) and verify that physical storage paths remain within authorized boundaries, preventing client-manipulated payload attacks.
- Cancellation races are guarded: workers verify status before and after execution to prevent overwriting `cancelled` states.
- Idempotency: duplicate submissions for identical active queries (`queued` or `running`) on the same dataset return the existing analysis record (`isDuplicate: true`) without running redundant calculations.
- Re-processing an analysis deduplicates existing artifact records to prevent history corruption.
- Startup reconciliation (`reconcileInterruptedJobs`) marks lingering `running` jobs from previous crashes as failed.

### 9. Truthful Dashboard & Artifact Delivery
- Dashboard slicers are explicitly labeled: `(filters displayed table rows below)` to ensure truthful representation without falsely claiming backend analytical recomputation.
- Ambiguous metrics halt execution cleanly with `status: 'ambiguity_clarification_needed'` and populate `clarificationQuestion` in the UI.
- Artifacts (executive HTML/PDF reports) are persisted to disk and registered in PostgreSQL, served only through authenticated endpoints verifying tenant ownership.

## Consequences

- **Security**: Complete isolation between tenants. Zero possibility of IDOR or cross-tenant data leaks. Hardened fail-closed boundaries prevent arbitrary code execution or in-memory state degradation in production.
- **Scalability**: Decoupling HTTP request handling from background analytical execution keeps API response times fast and predictable under high load.
- **Maintainability**: Unified TypeScript codebase sharing typed Zod contracts between React frontend and Node.js REST server.
- **Reliability**: All 41 test suites (251 unit and integration tests) pass consistently without flakiness.
