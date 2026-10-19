# ADR 0009: Business Context, Semantic Layer & Grounded Domain RAG

## Context & Problem Statement
In Milestone 9, the Autonomous Data Analyst requires a business semantic layer and domain context retrieval engine. Without semantic grounding, autonomous data agents suffer from critical business failure modes:
1. **Metric Hallucination & Formula Drift**: Agents invent ad-hoc formulas for key metrics (e.g., guessing whether "Revenue" means Gross Revenue, Net Revenue after discounts, or invoiced billings).
2. **Column Name Hallucination**: Agents generate SQL referencing non-existent columns (e.g., `sales_amount`, `margin`) instead of grounded dataset columns (`unit_price * quantity`).
3. **Additivity & Aggregation Violations**: Agents naively sum non-additive metrics (e.g., summing unit prices, average basket sizes, or percentage discounts across categories).
4. **Accounting Standard Non-Compliance**: Analytical calculations violate established enterprise accounting standards (e.g., ASC 606 revenue recognition rules).
5. **Prompt Injection & Context Poisoning**: In multi-tenant environments, untrusted document passages or user-uploaded glossary terms could attempt instruction hijacking or LLM control block injection (`<|im_start|>`, `<|system|>`).
6. **Silent Ambiguity Resolution**: When a user asks an ambiguous question ("What is our total revenue?"), agents guess an arbitrary interpretation without clarifying whether Gross or Net Revenue was intended.

---

## Architectural Decision

### 1. Versioned Declarative Semantic Contracts
We establish declarative Zod schemas (`src/lib/semantic/types.ts`) under contract version `1.0.0`:
- **`BusinessMetricDefinitionSchema`**: Authoritative specification of corporate metrics including metricId, name, version, status (`approved` | `draft` | `deprecated`), synonyms, calculation formula, SQL template, aggregation type (`sum`, `average`, `ratio`, etc.), additivity classification (`additive`, `semi_additive`, `non_additive`), required source columns and compatible data types, permitted dimensions, currency/unit, missing value policy, and audit owner.
- **`BusinessGlossaryTermSchema`**: Standard corporate terminology dictionary linking business terms, synonyms, authoritative definitions, and associated metric IDs.
- **`BusinessContextDocumentSchema`**: Governed business policy, accounting rule, or data dictionary passages with versioning, category, and scope boundaries.
- **`MetricResolutionResultSchema`**: Structured resolution outcome tracking resolution status (`resolved`, `ambiguous`, `unresolved_exploratory`, `incompatible_schema`), detected concept, resolved metric, column mappings, validated SQL expression, clarifying questions, conflicting definitions, missing columns, warnings, limitations, and full provenance with confidence score.

### 2. Multi-Level Scope & Tenant Boundary Isolation
All semantic entities and context documents enforce strict hierarchical scoping (`ContextScopeSchema`):
- `application_wide`: Shared corporate standards (e.g., ASC 606 revenue recognition, standard e-commerce KPI formulas) accessible to all queries.
- `organization`: Tenant/division-specific metrics and confidential rebate schedules accessible only when `organizationId` matches.
- `dataset_specific`: Annotations and column dictionaries bound strictly to a single dataset ID (`datasetId`).

Cross-tenant access attempts are rejected deterministically by `isScopeAccessible()`.

### 3. Prompt Injection Defense & Untrusted Passage Sanitization
Retrieved business text is treated strictly as **untrusted data**. Before passages are surfaced to the agent or caller:
- Control tokens and chat demarcation blocks (`<|im_start|>...<|im_end|>`, `<|system|>`, `<|user|>`, `<|assistant|>`) are excised and replaced with `[REDACTED_CONTROL_BLOCK]`.
- Instruction hijacking phrases (e.g., `"ignore previous instructions"`, `"system override"`, `"disregard system prompt"`) are neutralized and replaced with `[DISALLOWED_INSTRUCTION_FILTERED]`.

### 4. Schema-Grounded Metric Resolution Engine
`BusinessMetricResolver` executes a 5-step deterministic resolution pipeline:
1. **Synonym & Lexical Matching**: Evaluates user query against approved metrics and business glossary terms.
2. **Ambiguity Detection**: If multiple approved metrics match with similar relevance (e.g. Gross vs Net Revenue), status is set to `ambiguous`, returning conflicting metric definitions and an explicit clarifying question rather than guessing.
3. **Dataset Schema Verification**: Validates that required source columns exist in the profiled dataset and exhibit compatible data types (e.g. numeric columns for arithmetic operations). If columns are missing, returns `incompatible_schema` with the missing column list.
4. **Additivity Enforcement**: Inspects the metric's additivity classification (`non_additive`, `semi_additive`). If a ratio or non-additive metric is requested across group dimensions, generates clear warnings that simple arithmetic summation is invalid.
5. **Exploratory Concept Containment**: If no approved corporate metric matches, the status is set to `unresolved_exploratory`, nullifying `resolvedMetric` and issuing explicit warnings that any computations are exploratory and must never be presented as certified business KPIs.

### 5. Mastra Integration
Two dedicated Mastra tools are exposed and registered in `mastra` and on `dataAnalystAgent`:
- **`resolveBusinessMetricTool`** (`src/mastra/tools/resolve-business-metric-tool.ts`): Inspects dataset columns, enforces accounting standards, detects ambiguity, and outputs grounded SQL expressions.
- **`queryBusinessContextTool`** (`src/mastra/tools/query-business-context-tool.ts`): Retrieves relevant accounting documents, KPI handbooks, and glossary entries with source citations, version tracking, and prompt-injection neutralization.

Terminal demonstration is accessible via `npm run semantic:query`.

---

## Consequences

### Positive
- **Zero Hallucinated Metrics**: Metrics resolve to human-governed corporate standards.
- **Zero Hallucinated Columns**: SQL expressions map exclusively to validated dataset columns.
- **Auditable Provenance**: Every metric computation cites its corporate owner, version, formula, and policy document.
- **Safe Handling of Ambiguity**: Prevents reporting incorrect revenue figures when queries could mean Gross or Net.
- **Tenant Isolation**: Multi-tenant organizations cannot access private competitor rebate schedules or proprietary definitions.

### Negative / Trade-offs
- Initial configuration requires registering corporate metrics and policies in the semantic catalog.
- Ambiguous questions halt automated one-shot execution to ask for human clarification, prioritizing correctness over blind assumption.
