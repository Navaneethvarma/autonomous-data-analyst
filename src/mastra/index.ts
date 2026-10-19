import { Mastra } from '@mastra/core';
import { dataAnalystAgent } from './agents/data-analyst-agent.js';
import { profileDatasetTool } from './tools/profile-dataset-tool.js';
import { inspectDatasetTool } from './tools/inspect-dataset-tool.js';
import { previewDatasetTool } from './tools/preview-dataset-tool.js';
import { formulateAnalysisPlanTool } from './tools/formulate-analysis-plan-tool.js';
import { validateAnalysisResultTool } from './tools/validate-analysis-result-tool.js';
import { executeAnalyticalQueryTool } from './tools/execute-analytical-query-tool.js';
import { runAutomatedEdaTool } from './tools/run-automated-eda-tool.js';
import { generateDashboardSpecTool } from './tools/generate-dashboard-spec-tool.js';
import { generateReportTool } from './tools/generate-report-tool.js';
import { runPythonAnalysisTool } from './tools/run-python-analysis-tool.js';
import { resolveBusinessMetricTool } from './tools/resolve-business-metric-tool.js';
import { queryBusinessContextTool } from './tools/query-business-context-tool.js';
import { analyticalWorkflow, ANALYTICAL_WORKFLOW_ID } from './workflows/analytical-workflow.js';

/**
 * Main Mastra application instance.
 * Registers agents, workflows, and tools according to Mastra conventions.
 */
export const mastra = new Mastra({
  agents: {
    dataAnalystAgent,
  },
  workflows: {
    analyticalWorkflow,
    [ANALYTICAL_WORKFLOW_ID]: analyticalWorkflow,
  },
  tools: {
    profileDatasetTool,
    inspectDatasetTool,
    previewDatasetTool,
    formulateAnalysisPlanTool,
    resolveBusinessMetricTool,
    queryBusinessContextTool,
    executeAnalyticalQueryTool,
    runAutomatedEdaTool,
    generateDashboardSpecTool,
    generateReportTool,
    runPythonAnalysisTool,
    validateAnalysisResultTool,
  },
});
