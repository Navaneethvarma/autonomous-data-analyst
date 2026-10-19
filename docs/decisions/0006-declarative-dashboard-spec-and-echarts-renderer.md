# ADR 0006: Declarative Dashboard Specification and Deterministic React/ECharts Renderer

## Status
Accepted

## Context
In Milestone 6, the Autonomous Data Analyst requires an interactive dashboard generation capability serving as our native, open-source alternative to Power BI. Routine business intelligence work involves transforming raw tabular data into accessible executive visual interfaces with KPI cards, multi-dimensional charts, correlation matrices, interactive slicers, and paginated records.

Key architectural requirements:
1. **Separation of Concerns**: Dashboard specification generation must remain completely isolated from client rendering and the agent's LLM reasoning loop.
2. **Data, Not Code**: The dashboard specification must be pure declarative data (`DashboardSpec`), not executable JavaScript, HTML strings, or dynamic chart callbacks. Under no circumstances may the LLM emit arbitrary code executed in the browser.
3. **Evidence Grounding**: All KPI cards, chart data points, and tables must originate strictly from DuckDB computations and validated EDA distributions.
4. **Adaptive Chart Selection**: Rather than forcing arbitrary datasets into generic visual templates, visualizations must be selected adaptively based on cardinality, data types, and statistical properties.
5. **Security & Guardrails**: Enforce strict caps on chart count, data points per chart, table rows, and filters to guarantee browser responsiveness and prevent denial-of-service vulnerabilities.

## Decisions

### 1. Declarative, Versioned `DashboardSpec` (`src/lib/dashboard/types.ts`)
We defined a versioned Zod schema (`DASHBOARD_SCHEMA_VERSION = '1.0.0'`) defining:
- **`metadata`**: Dataset identity, record counts, completeness score, generation timestamp, and explicit flags distinguishing complete-dataset aggregates from bounded display rows (`isAggregateComplete: true`).
- **`kpis`**: Headline metrics (value, formattedValue, unit, delta, trendDirection, definition, and DuckDB evidence reference).
- **`charts`**: Structured specifications (`bar`, `line`, `scatter`, `donut`, `histogram`) with category lists, series values, axis labels, outlier threshold bounds, and $\pm 2\sigma$ anomaly markers.
- **`correlationMatrix`**: Pairwise Pearson correlation entries coupled with an inescapable methodological caution against assuming causation.
- **`table`**: Typed column schema, bounded preview rows, sorting defaults, and pagination metadata.
- **`filters`**: Interactive slicer definitions (`category_select`, `status_select`) populated from discrete column domains.
- **`insights`**: Embedded strategic findings maintaining explicit separation between `observedFact`, `hypothesis`, and `recommendation`.
- **`guardrails`**: Maximum 16 charts, 8 KPIs, 5,000 points per chart, and 1,000 table rows.

### 2. Frontend Framework Choice: Vite + React 19 + Apache ECharts
We evaluated frontend architectures and chose **Vite with React 19, TypeScript, and Apache ECharts (`echarts`)**:
- **Why Vite over Next.js for Milestone 6**: The repository is an agentic analytical service. Vite provides a lightweight, blazingly fast client application (`/dist/client`) without requiring a separate Node.js SSR runtime daemon, Next.js server configuration, or dual build steps.
- **Why Apache ECharts**: ECharts is an enterprise-grade visualization engine supporting rich chart types (smooth area lines, donut gauges, histograms, scatter plots) with high rendering performance (SVG/Canvas), accessible labels, dark theme support, and responsive resizing.
- **Deterministic React Renderer**:
  - `KpiCard.tsx`: Metric values with trend badges, evidence tags, and definitions.
  - `EChartsChart.tsx`: Encapsulated ECharts lifecycle with `ResizeObserver`, dark palette, and tooltip formatting.
  - `FilterBar.tsx`: Real-time interactive slicers that filter table rows and visual focus.
  - `DataTable.tsx`: Client-side search, multi-column sorting, and pagination with clear aggregate completeness disclosures.
  - `InsightsPanel.tsx`: Structured fact vs hypothesis vs action cards.
  - `CorrelationView.tsx`: Tabular pairwise correlation matrix with causation alerts.

### 3. Mastra Agent Integration
- Implemented [`generateDashboardSpecTool`](../../src/mastra/tools/generate-dashboard-spec-tool.ts) and registered it on `mastra` and [`dataAnalystAgent`](../../src/mastra/agents/data-analyst-agent.ts).
- Codified the 6-stage analytical sequence in agent instructions:
  $$\text{Inspect} \rightarrow \text{Plan} \rightarrow \text{Execute (DuckDB)} \rightarrow \text{Validate} \rightarrow \text{EDA \& Insights} \rightarrow \text{DashboardSpec} \rightarrow \text{Render}$$

## Consequences
- Produces a production-grade interactive Power BI alternative that runs entirely locally with zero external SaaS dependencies.
- Zero risk of arbitrary code injection (XSS/eval): all dashboard specifications are validated against strict Zod contracts.
- Frontend bundle builds cleanly via `npm run build:dashboard` into `dist/client/`.
- Local live preview accessible via `npm run dev:dashboard` on `http://localhost:5173/`.
