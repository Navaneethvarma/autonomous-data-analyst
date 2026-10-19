import { createTool } from '@mastra/core/tools';
import {
  profileDatasetInputSchema,
  profileDatasetOutputSchema,
  type DatasetProfile,
} from '../../lib/dataset/types.js';
import { profileDataset } from '../../lib/dataset/profiler.js';

export const PROFILE_DATASET_TOOL_ID = 'profile-dataset-tool';

/**
 * Mastra Tool to inspect and profile datasets safely.
 */
export const profileDatasetTool = createTool({
  id: PROFILE_DATASET_TOOL_ID,
  description:
    'Inspects and profiles a tabular dataset file (.csv) within the authorized datasets directory. ' +
    'Returns row and column counts, inferred column data types, missing-value percentages, duplicate-row counts, ' +
    'numeric statistics (min, max, mean, median, standard deviation, quartiles), frequent categorical values, ' +
    'and empirical data-quality warnings.',
  inputSchema: profileDatasetInputSchema,
  outputSchema: profileDatasetOutputSchema,
  execute: async (inputData): Promise<DatasetProfile> => {
    return await profileDataset(inputData.filePath, {
      maxDistinctTracked: inputData.maxDistinctValues,
    });
  },
});
