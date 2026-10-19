# ADR 0008: Sandboxed Python Analytics Engine, Isolation Boundaries & Statistical Rigor

## Context & Problem Statement
In Milestone 8, the Autonomous Data Analyst requires a Python execution capability to extend DuckDB analytical queries and automated EDA with advanced statistical methods:
- Descriptive distribution moments (skewness, excess kurtosis, standard error, exact Student's t 95% confidence intervals, and Tukey IQR outlier boundaries).
- Two-sample group comparisons and hypothesis tests (Welch's two-sample t-test, Mann-Whitney U rank test, and Cohen's d effect size).
- Ordinary Least Squares (OLS) linear regression modeling (slope, intercept, R², adjusted R², standard error, and p-values).
- Multi-group comparisons via One-Way ANOVA F-tests.
- Categorical independence testing via Chi-Square contingency analysis.
- Time-series decomposition and rolling moving averages with strict observation thresholds ($n \ge 15$).

Executing agent-generated or dynamic Python code presents acute security, isolation, and stability risks:
1. **Remote Code Execution & Host Compromise**: Untrusted Python code could access the host filesystem, manipulate application code, or spawn arbitrary shell processes (`os.system`, `subprocess`).
2. **Credential & Secret Theft**: Untrusted code could read `process.env` (e.g. `OPENAI_API_KEY`, database credentials).
3. **Data Exfiltration**: Untrusted code could establish outbound network sockets or HTTP requests (`urllib`, `requests`, `socket`).
4. **Denial of Service & Buffer Exhaustion**: Untrusted code could loop indefinitely (`while True`), consume memory, or generate megabytes of stdout.
5. **Path Traversal**: Manipulating dataset paths to read sensitive operating system or project files.

---

## Security Boundary & Threat Model

### Honest Sandbox Disclosure
We explicitly distinguish a **Restricted Python Subprocess** (developer workstation execution) from a **Hardened Security Sandbox** (production container isolation):

1. **Developer Workstation (Restricted Subprocess)**:
   - On bare developer workstations (Windows/macOS/Linux), execution runs in a restricted OS subprocess (`worker_runner.py`).
   - **Environment Scrubbing**: Filters out `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, database credentials, and cloud secrets, passing only bare OS runtime essentials.
   - **AST & Token Pre-Execution Filter**: Statically inspects Python code to reject forbidden imports (`os`, `subprocess`, `shutil`, `socket`, `urllib`, `requests`, `ctypes`, `builtins`, `eval`, `exec`).
   - **CRITICAL SECURITY NOTE**: AST validation and token inspection are defense-in-depth pre-execution hygiene filters, **NOT a security sandbox**. Static AST parsing alone cannot prevent all dynamic introspection, bytecode tricks, side channels, or kernel exploits. Arbitrary or untrusted generated Python is **NOT** presented as production-safe on developer workstations.
   - **Ephemeral Scratchpad**: Operates inside an isolated temporary directory (`reports/tmp/py_sandbox_<uuid>`) with automatic cleanup.
   - **Path Traversal Guard**: Strictly bounds dataset file ingestion to authorized workspace roots (`datasets/`, `data/`, `reports/`, `tests/`).
   - **Resource Capping**: Enforces wall-clock execution limits (default 10s, max 30s) and buffer size caps (512 KB) to prevent DoS.

2. **Production Hardened Isolation (Container Sandbox)**:
   - Production environments mandate a kernel-isolated container sandbox (Docker / gVisor).
   - Zero network egress (`--network none`).
   - Read-only root filesystem (`--read-only`) with a small mounted tmpfs (`--tmpfs /tmp:size=64M`).
   - Strict cgroups CPU and memory limits (`--cpus=1 --memory=512m`).
   - Non-root user execution (`--user 10001:10001`).

3. **Explicit Isolation Capability Check & Rejection Policy**:
   - The runner provides an explicit capability check (`isStrictProductionIsolationRequired()` and `isContainerIsolationActive()`).
   - When running in production (`NODE_ENV === 'production'`) or strict container mode (`PYTHON_SANDBOX_MODE === 'strict_container_only'`), arbitrary/untrusted custom scripts (`taskType: 'custom_script'`) **MUST** require verified container isolation (`CONTAINER_SANDBOX_ACTIVE === 'true'`).
   - If required container isolation is unavailable, untrusted execution is **strictly rejected** rather than silently falling back to the developer workstation subprocess.
   - Built-in parameter-driven statistical routines (e.g. descriptive stats, regression, ANOVA) execute fixed Python functions in `worker_runner.py` with no arbitrary code evaluation.

---

## Statistical Methodology & Confidence Intervals

### 1. Student's t Distribution Critical Values
- For inference about a sample mean with estimated variance $s^2$, the sampling distribution follows a Student's t distribution with degrees of freedom $df = n - 1$.
- `worker_runner.py` uses exact Student's t critical values ($t_{\text{crit}}$ at $\alpha=0.05$, two-tailed) rather than an uncalibrated asymptotic normal $z=1.96$:
  - Lookups cover exact values for $df = 1 \dots 30$ (e.g., $df=8 \implies t_{\text{crit}} = 2.306$).
  - For $df > 30$, `scipy.stats.t.ppf` or Hill's Cornish-Fisher expansion is applied.
  - Asymptotic normal approximation is only used when $df \ge 30$ and is explicitly labeled as `student_t_asymptotic_normal`.
- For the nine-observation example ($n=9, df=8$, e.g. `unit_price` in `sample_sales.csv` with 1 null):
  - $\text{Mean} = 346.51, \text{SE} = 148.53, t_{\text{crit}} = 2.306$.
  - Exact 95% Confidence Interval: $[4.00, 689.02]$. (Normal approximation $1.96 \times SE$ had falsely understated the margin of error at $[55.39, 637.63]$).

### 2. Statistical Boundaries & Edge Cases
- **Insufficient Observations ($n=1$)**: Sample variance $s^2$ is undefined ($df = 0$). Returns `stdDev: null, variance: null, ci95Lower: null, ci95Upper: null, ciMethod: 'insufficient_sample_size'` with explicit warning.
- **Zero Variance ($s=0$)**: Constant observations return point interval $[\bar{x}, \bar{x}]$ labeled `degenerate_zero_variance` with warning.
- **Coverage Limitations**: Structured warnings explicitly declare that confidence intervals **do not resolve** underlying non-normality, sample dependence, selection bias, or outlier distortion.

### 3. Statistical Communication & Restraint on Downstream Insights
- All results preserve sample sizes ($n$), degrees of freedom, assumptions, warnings, effect sizes (Cohen's d), and significance status ($p$-values).
- Downstream agents and insight generators are constrained by agent instructions:
  - Small-sample results ($n < 30$, or failing normality) MUST be designated as exploratory, preliminary findings.
  - Never convert exploratory small-sample results into confident business recommendations or policy directives without disclosing wide confidence intervals, high margins of error, and the need for larger-sample confirmation.
  - Existing statistical calculations are never altered to appear more impressive.

---

## Versioned Contract & Schema (`src/lib/python/types.ts`)
1. **`PythonAnalysisRequestSchema`**:
   - `taskId`, `taskType`, `datasetId`, `datasetPath`, `columns`, `parameters`, `code`, `limits`.
2. **`PythonAnalysisResultSchema` (`contractVersion: '1.0.0'`)**:
   - `status`: `'success' | 'error' | 'timeout' | 'validation_failed'`.
   - `interpretation`: Concise, non-causal statistical summary.
   - `sampleSize`: Explicit counts for `totalRows`, `validObservations`, `droppedOrMissing`, and `degreesOfFreedom`.
   - `numericResults`: Validated numbers, with Python `NaN` and `Infinity` explicitly converted to `null`.
   - `assumptions`: Array of statistical assumptions evaluated (normality, homoscedasticity, sample size adequacy).
   - `warnings`: Actionable warnings when assumptions are violated or test power is limited.
   - `provenance`: Traceability tracking dataset ID, path, execution time, timestamp, Python version, library versions, `workerSandboxType` (`restricted_subprocess_dev` vs `container_sandbox`), and `isolationLevel` (`development_restricted_subprocess` vs `production_hardened_container`).

---

## Mastra Integration & Sequence
The `run-python-analysis-tool` is registered with Mastra and the `dataAnalystAgent`. The agent follows an expanded 7-stage analytical sequence:
1. Inspect & Profile (`profile-dataset-tool`, `inspect-dataset-tool`)
2. Plan Analysis (`formulate-analysis-plan-tool`)
3. Compute SQL / DuckDB Results (`execute-analytical-query-tool`, `run-automated-eda-tool`)
4. Use Python When Justified (`run-python-analysis-tool`)
5. Validate Evidence & Assumptions (`validate-analysis-result-tool`)
6. Generate Insights (`run-automated-eda-tool`)
7. Produce Dashboards & Reports (`generate-dashboard-spec-tool`, `generate-report-tool`)
