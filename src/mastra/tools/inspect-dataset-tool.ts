import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { profileDataset } from '../../lib/dataset/profiler.js';
import { datasetProfileCache } from '../../lib/dataset/cache.js';
import { validateAndResolveDatasetPath } from '../../lib/dataset/validator.js';

export const INSPECT_DATASET_TOOL_ID = 'inspect-dataset-tool';

export const inspectDatasetInputSchema = z.object({
  filePath: z.string().min(1, 'File path must be provided'),
});

export const inspectDatasetOutputSchema = z.object({
  fileName: z.string(),
  fileSizeBytes: z.number(),
  rowCount: z.number(),
  columnCount: z.number(),
  columns: z.array(
    z.object({
      name: z.string(),
      inferredType: z.string(),
      nullCount: z.number(),
      nullPercentage: z.number(),
      distinctCount: z.number(),
      warnings: z.array(z.string()),
    })
  ),
  warnings: z.array(
    z.object({
      type: z.string(),
      column: z.string().optional(),
      message: z.string(),
    })
  ),
  cached: z.boolean(),
  inspectedAt: z.string(),
});

export type InspectDatasetOutput = z.infer<typeof inspectDatasetOutputSchema>;

/**
 * Mastra Tool to inspect lightweight schema definitions and quality warnings.
 * Uses cached profile when available to avoid redundant disk reads.
 */
export const inspectDatasetTool = createTool({
  id: INSPECT_DATASET_TOOL_ID,
  description:
    'Inspects a tabular dataset (.csv) to retrieve lightweight schema definitions, inferred data types, ' +
    'null percentages, distinct value counts, and active data-quality warnings. Reuses cached profiling results when valid.',
  inputSchema: inspectDatasetInputSchema,
  outputSchema: inspectDatasetOutputSchema,
  execute: async (inputData): Promise<InspectDatasetOutput> => {
    const { resolvedPath } = validateAndResolveDatasetPath(inputData.filePath);
    const isCached = datasetProfileCache.get(resolvedPath) !== null;

    const profile = await profileDataset(inputData.filePath);

    return {
      fileName: profile.fileName,
      fileSizeBytes: profile.fileSizeBytes,
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      columns: profile.columns.map(c => ({
        name: c.name,
        inferredType: c.inferredType,
        nullCount: c.nullCount,
        nullPercentage: c.nullPercentage,
        distinctCount: c.distinctCount,
        warnings: c.warnings,
      })),
      warnings: profile.warnings,
      cached: isCached,
      inspectedAt: new Date().toISOString(),
    };
  },
});
