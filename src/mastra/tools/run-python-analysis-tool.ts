import { createTool } from '@mastra/core/tools';
import {
  PythonAnalysisRequestSchema,
  PythonAnalysisResultSchema,
  type PythonAnalysisResult,
} from '../../lib/python/types.js';
import { executeSandboxedPython } from '../../lib/python/sandbox-runner.js';

export const RUN_PYTHON_ANALYSIS_TOOL_ID = 'run-python-analysis-tool';

/**
 * Mastra Tool to execute sandboxed Python analytics against authorized datasets.
 */
export const runPythonAnalysisTool = createTool({
  id: RUN_PYTHON_ANALYSIS_TOOL_ID,
  description:
    'Executes Python statistical analysis tasks against an explicitly authorized dataset. ' +
    'In development, execution runs in a restricted subprocess with stripped credentials, AST filtering, and strict timeout/buffer limits. ' +
    'In production, strict container isolation is required for untrusted execution. ' +
    'Use this tool strategically when advanced statistical rigor beyond DuckDB SQL is justified: ' +
    '1. "descriptive_stats": Distribution moments, standard error, exact Student t 95% confidence intervals, and Tukey outlier boundaries. ' +
    '2. "group_comparison": Welch two-sample t-test, Mann-Whitney U rank test, and Cohen d effect size. ' +
    '3. "regression": Ordinary Least Squares (OLS) regression slope, intercept, R², adjusted R², and p-value. ' +
    '4. "anova": One-way ANOVA F-test across multiple category groups. ' +
    '5. "chi_square": Categorical independence test on contingency tables. ' +
    '6. "time_series": Rolling moving averages and trend forecasting (minimum 15 sequenced observations required). ' +
    '7. "custom_script": Validated statistical Python snippet evaluated with AST inspection. ' +
    'All returned payloads preserve exact sample sizes, degrees of freedom, statistical assumptions, and critical data warnings.',
  inputSchema: PythonAnalysisRequestSchema,
  outputSchema: PythonAnalysisResultSchema,
  execute: async (inputData): Promise<PythonAnalysisResult> => {
    return await executeSandboxedPython(inputData);
  },
});
