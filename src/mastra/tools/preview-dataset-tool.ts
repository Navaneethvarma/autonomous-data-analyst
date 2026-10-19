import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { previewDataset, type PreviewDatasetResult } from '../../lib/dataset/preview.js';

export const PREVIEW_DATASET_TOOL_ID = 'preview-dataset-tool';

export const previewDatasetInputSchema = z.object({
  filePath: z.string().min(1, 'File path must be provided'),
  mode: z.enum(['head', 'tail', 'sample']).default('head'),
  limit: z.number().int().min(1).max(100).default(10),
  columns: z.array(z.string()).optional(),
});

export const previewDatasetOutputSchema = z.object({
  fileName: z.string(),
  totalRows: z.number(),
  previewCount: z.number(),
  mode: z.enum(['head', 'tail', 'sample']),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string().nullable())),
});

/**
 * Mastra Tool to preview bounded subsets of dataset rows (head, tail, or uniform sample).
 * Strictly bounds rows (max 100) and supports column projection.
 */
export const previewDatasetTool = createTool({
  id: PREVIEW_DATASET_TOOL_ID,
  description:
    'Retrieves a bounded sample of records from a dataset (.csv) using head, tail, or uniform sample modes. ' +
    'Supports optional column projection and strictly limits preview size to between 1 and 100 rows.',
  inputSchema: previewDatasetInputSchema,
  outputSchema: previewDatasetOutputSchema,
  execute: async (inputData): Promise<PreviewDatasetResult> => {
    return await previewDataset(inputData.filePath, {
      mode: inputData.mode,
      limit: inputData.limit,
      columns: inputData.columns,
    });
  },
});
