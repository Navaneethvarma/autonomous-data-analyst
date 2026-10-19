import { createTool } from '@mastra/core/tools';
import {
  GenerateDashboardSpecInputSchema,
  DashboardSpecSchema,
  type DashboardSpec,
} from '../../lib/dashboard/types.js';
import { generateDashboardSpec } from '../../lib/dashboard/generator.js';

export const GENERATE_DASHBOARD_SPEC_TOOL_ID = 'generate-dashboard-spec-tool';

/**
 * Mastra Tool to generate a declarative, versioned DashboardSpec for an authorized dataset.
 */
export const generateDashboardSpecTool = createTool({
  id: GENERATE_DASHBOARD_SPEC_TOOL_ID,
  description:
    'Generates a declarative, versioned DashboardSpec for an authorized dataset using DuckDB computations and automated EDA. ' +
    'Produces executive KPI headline cards, adaptive charts (bar, line, scatter, donut, histogram), ' +
    'a correlation matrix with causation caveats, a paginated data table, interactive filters, ' +
    'and evidence-backed business insights with strict fact vs hypothesis separation.',
  inputSchema: GenerateDashboardSpecInputSchema,
  outputSchema: DashboardSpecSchema,
  execute: async (inputData): Promise<DashboardSpec> => {
    return await generateDashboardSpec(inputData);
  },
});
