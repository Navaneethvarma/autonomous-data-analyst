import { createTool } from '@mastra/core/tools';
import {
  RunAutomatedEdaInputSchema,
  EdaAndInsightsResultSchema,
  type EdaAndInsightsResult,
} from '../../lib/analytics/eda-types.js';
import { runAutomatedEda } from '../../lib/analytics/eda-engine.js';
import {
  generateBusinessInsights,
  buildEdaAndInsightsResult,
} from '../../lib/analytics/insight-generator.js';

export const RUN_AUTOMATED_EDA_TOOL_ID = 'run-automated-eda-tool';

/**
 * Mastra Tool to run automated Exploratory Data Analysis (EDA) and synthesize
 * ranked, evidence-backed business insights with strict fact vs hypothesis separation.
 */
export const runAutomatedEdaTool = createTool({
  id: RUN_AUTOMATED_EDA_TOOL_ID,
  description:
    'Performs comprehensive automated Exploratory Data Analysis (EDA) and generates ranked, ' +
    'evidence-backed business insights across the full authorized dataset using DuckDB. ' +
    'Analyzes numeric distributions (mean, median, std dev, IQR, skewness, kurtosis), outlier detection, ' +
    'categorical cardinality and concentration, temporal trends, pairwise Pearson correlations with causation caveats, ' +
    'and data quality risks. Produces structured findings distinguishing observed empirical facts from hypotheses and recommendations.',
  inputSchema: RunAutomatedEdaInputSchema,
  outputSchema: EdaAndInsightsResultSchema,
  execute: async (inputData): Promise<EdaAndInsightsResult> => {
    const edaSummary = await runAutomatedEda(inputData);
    const insights = generateBusinessInsights(edaSummary);
    return buildEdaAndInsightsResult(edaSummary, insights);
  },
});
