# ADR 0005: Automated EDA Engine and Evidence-Backed Business Insights

## Status
Accepted

## Context
In Milestone 5, the Autonomous Data Analyst requires automated exploratory data analysis (EDA) and automated business insight generation.Routine data analyst work consists heavily of initial data hygiene audits, distribution profiling, anomaly detection, correlation analysis, and synthesizing actionable business findings for executive decision-makers.

Key requirements:
1. **Real Computation Over Estimation**: Use DuckDB for substantial analytical calculations (mean, std dev, median, quartiles, IQR, skewness, kurtosis, outlier counts, category concentration, temporal trajectories, Pearson correlations) over 100% of the dataset rather than estimating statistics from preview rows or LLM approximations.
2. **Evidence-Backed Insights**: Every finding must reference concrete computed figures, affected columns, supporting metrics, and the analytical method used.
3. **Strict Epistemic Separation**: Distinguish observed empirical facts from exploratory hypotheses and actionable recommendations.
4. **Anti-Causation Safeguards**: Prohibit asserting causal mechanisms based on correlation alone.
5. **Edge-Case Resilience**: Safely handle small datasets ($N < 5$), empty datasets ($N = 0$), constant columns (zero variance), 100% null columns, and missing data without crashes or division by zero.
6. **Structured Versioned Contract**: Output must be versioned (`1.0.0`) and consumable by future Milestone 6 (interactive dashboards) and Milestone 7 (executive reports).

## Decisions

### 1. Dual-Component Pipeline: EDA Engine + Insight Generator
We separated statistical computation from business interpretation:
- **`eda-engine.ts` (`runAutomatedEda`)**:
  - Operates directly via DuckDB in-memory database with double-layer sandboxing (`SET enable_external_access = false;`).
  - Computes numeric distributions: `MIN`, `MAX`, `AVG`, `MEDIAN`, `STDDEV_SAMP`, `VAR_SAMP`, `QUANTILE_CONT(col, 0.25)`, `QUANTILE_CONT(col, 0.75)`, `SKEWNESS`, and `KURTOSIS`.
  - Calculates IQR outlier bounds: $[Q1 - 1.5 \times IQR, Q3 + 1.5 \times IQR]$, counting the exact number and percentage of outlier rows via SQL.
  - Computes categorical cardinality, distinct counts, unique ratios, mode, and concentration percentage of the dominant category.
  - Evaluates temporal trends: detects date columns, automatically selects granularity (daily, weekly, monthly) based on date range, tracks trajectory direction (`increasing`, `decreasing`, `flat`, `volatile`), computes net growth rate, and flags anomalous periods exceeding $\pm 2\sigma$.
  - Calculates pairwise Pearson correlation coefficients (`CORR(colA, colB)`) between non-constant numeric columns with sufficient sample size ($N \ge 4$).
- **`insight-generator.ts` (`generateBusinessInsights`)**:
  - Translates computed EDA distributions into ranked, structured findings.
  - Assigns importance tiers (`critical`, `high`, `medium`, `low`) based on business impact: critical data hygiene risks -> extreme outliers/concentration -> significant trends -> moderate correlations.
  - Enforces three distinct narrative fields: `observedFact`, `hypothesis`, and `recommendation`.
  - Attaches `supportingMetrics` containing only computed figures directly from the EDA summary.

### 2. Strict Epistemic Discipline & Causation Caveat
- Every correlation finding includes an explicit, mandatory limitation:
  *"CRITICAL: Correlation does NOT demonstrate or imply causation. Unmeasured confounders or external factors may account for the relationship."*
- Recommendations for correlation insights explicitly advise conducting controlled A/B testing or multivariate regression before implementing operational policy changes.
- Confidence scores are dynamically calibrated based on sample size and completeness score:
  - $\text{High}$: $N \ge 50$ rows and $\ge 90\%$ completeness.
  - $\text{Medium}$: $N \ge 10$ rows and $\ge 70\%$ completeness.
  - $\text{Low}$: $N < 10$ rows or $< 70\%$ completeness.

### 3. Edge-Case Safety
- **Empty Datasets ($N = 0$)**: Detected immediately via `COUNT(*)`; returns zero completeness, empty distribution arrays, and a `critical` data quality issue (`empty_dataset`) without triggering division by zero.
- **Constant Columns**: Evaluated when $stdDev = 0$ or $min = max$ (or $distinctCount = 1$ for categories). Flagged with `constant_column` warnings and safely excluded from correlation matrices to prevent NaN propagation.
- **Complete Missingness**: Columns with 100% null values are flagged with `complete_missingness` critical quality issues and bypassed for parametric statistics.
- **Small Sample Sizes**: Datasets with $N < 5$ generate `small_sample_size` warnings; outlier detection and correlation calculations require minimum sample thresholds ($N \ge 4$).

### 4. Versioned Schema & Future Milestone Alignment
The output conforms to `EdaAndInsightsResultSchema` (version `1.0.0`):
- `eda`: Comprehensive dataset metrics, column summaries, temporal points, and correlation matrices.
- `insights`: Ranked business findings with facts, hypotheses, actions, and supporting metric maps.
- `provenance`: File name, execution duration, timestamp, and engine identity.
This provides the direct data foundation for:
- Milestone 6: Power BI-like dashboard generation (KPI cards from mode/concentration, line charts from temporal data points, scatter plots from correlations, outlier box plots).
- Milestone 7: Executive business reports (narrative sections directly incorporating facts, hypotheses, and recommendations).

### 5. Mastra Integration
- Registered as `runAutomatedEdaTool` on both `mastra` and `dataAnalystAgent`.
- Updated `dataAnalystAgent` instructions to mandate the 5-stage analytical sequence:
  1. Inspect & Profile
  2. Plan Analysis
  3. Compute Results & Automated EDA
  4. Validate Evidence
  5. Generate Insights (distinguishing observed facts from hypotheses).

## Consequences
- Complete, automated EDA capability operating across 100% of authorized datasets in milliseconds via DuckDB.
- Zero hallucination of statistics: all insights reference computed ground truth.
- Seamless CLI execution via `npm run eda`.
