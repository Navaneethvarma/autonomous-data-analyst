# ADR 0003: Dashboard and Business Reporting Architecture Strategy

## Status
Accepted

## Context
A core requirement of the Autonomous Data Analyst product vision is to provide a free or open-source alternative to Power BI for automating routine analytical workloads. The system must generate:
1. Interactive analytical dashboards (KPI cards, bar/line/scatter/pie charts, data tables, and dynamic filters).
2. Professional executive business reports (executive summary, methodology, KPIs, key findings, supporting visual evidence, recommendations, and quality warnings) with PDF/HTML export capabilities.

We evaluated three potential architectural options:
- **Option 1: Native In-App Dashboard & Reporting Engine** (React, TypeScript, ECharts/Recharts, structured JSON dashboard specifications).
- **Option 2: Apache Superset** (Full-featured open-source BI platform).
- **Option 3: Metabase** (Lightweight open-source BI platform).

## Comparative Evaluation

| Evaluation Criteria | Option 1: Native React + Charting (Selected) | Option 2: Apache Superset | Option 3: Metabase |
|---|---|---|---|
| **Architectural Complexity** | Low: Direct single-stack integration with Next.js/React and TypeScript backend. Zero external services required. | High: Requires Python backend, Celery workers, Redis, PostgreSQL metadata DB, and Docker orchestration. | Medium: Requires Java/Clojure runtime, application database, and separate server process. |
| **Agent Direct Control** | Total: The agent generates strongly-typed JSON dashboard specifications directly from verified computational queries. | Limited: Requires reverse-engineering Superset's REST/metadata API to programmatically create datasets, charts, slices, and dashboards. | Moderate: Requires interacting with Metabase REST API (Cards, Dashboards, Collections). |
| **Licensing & Embedding** | Permissive (MIT / Apache 2.0). Embeds seamlessly without iframe restrictions or paywalled embedding features. | Apache 2.0, but embedding requires iframe guest tokens and complex CORS/cookie configuration. | AGPLv3 for open-source edition; embedded interactive features and token auth require paid Enterprise/Commercial tiers. |
| **Interactivity & Speed** | Sub-second client-side rendering; instant cross-filtering, drill-down, and tooltips via component state. | Relies on Superset's chart render pipeline and query caching; roundtrip latency for dynamically generated views. | Fast, but restricted by Metabase's widget model. |
| **Report Generation & Export** | Native HTML-to-PDF / print stylesheets / headless Chrome rendering with custom corporate branding. | Built-in email/Slack alerts, but programmatic PDF export requires Playwright/WebDriver sidecar containers. | Pulse reports and static PDF export, with restrictions in open-source edition. |
| **Maintenance Burden** | Minimal: Maintained as standard TypeScript frontend components. | Substantial: Database migrations, Celery queue monitoring, Redis caching, and version upgrades. | Moderate: Upgrades to Java backend and Metabase schema. |

## Decision

1. **Native Primary Experience**:
   - The primary dashboard and reporting experience will be built **natively** into the application using **React, TypeScript, and a maintained charting library (e.g. Apache ECharts via `echarts-for-react`)**.
   - The agent and analytical execution layer will emit **declarative JSON dashboard specifications** (`DashboardSpec`) and **report specifications** (`ReportSpec`) validated by strict Zod schemas.
   - The frontend will deterministically render KPI cards, charts, data tables, and interactive slicers from these verified specifications.
   - Reports will be rendered as clean, printable HTML documents with high-fidelity PDF export capabilities.

2. **DuckDB as Local Analytical Engine**:
   - In-app analytical execution will be powered by DuckDB (Milestone 4), allowing fast SQL aggregations, time-series analysis, and KPI calculations directly over CSV/Parquet files without heavy database servers.

3. **Superset as Optional Enterprise Integration (Milestone 12)**:
   - Apache Superset will be retained on the roadmap as an optional external integration for enterprises that already operate a centralized Superset deployment and want datasets or dashboard slices exported to their existing BI hub.

## Consequences
- No heavyweight external services or database dependencies are forced onto the user for core dashboard and reporting functionality.
- The user experience is unified: asking a question produces verified calculations, a live interactive dashboard, and a formatted report in a single interface.
- Complete type safety and deterministic guarantees from raw data to chart pixels.
