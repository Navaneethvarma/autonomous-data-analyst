import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  profileDatasetTool,
  PROFILE_DATASET_TOOL_ID,
} from '../../src/mastra/tools/profile-dataset-tool.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';
import { mastra } from '../../src/mastra/index.js';
import {
  profileDatasetInputSchema,
  profileDatasetOutputSchema,
} from '../../src/lib/dataset/types.js';

describe('Profile Dataset Mastra Tool Integration', () => {
  const testDir = path.resolve(process.cwd(), 'datasets');
  const sampleFilePath = path.join(testDir, 'tool_test_sample.csv');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      sampleFilePath,
      'product_id,product_name,unit_price,in_stock\n101,Keyboard,49.99,true\n102,Mouse,24.50,true\n103,Monitor,199.99,false'
    );
  });

  afterAll(() => {
    if (fs.existsSync(sampleFilePath)) {
      fs.unlinkSync(sampleFilePath);
    }
  });

  it('exposes correct id, description, and schemas', () => {
    expect(profileDatasetTool.id).toBe(PROFILE_DATASET_TOOL_ID);
    expect(profileDatasetTool.description).toBeDefined();
    expect(profileDatasetTool.inputSchema).toBeDefined();
    expect(profileDatasetTool.outputSchema).toBeDefined();
  });

  it('validates input schema correctly', () => {
    const valid = profileDatasetInputSchema.safeParse({
      filePath: 'tool_test_sample.csv',
      maxDistinctValues: 500,
    });
    expect(valid.success).toBe(true);

    const invalid = profileDatasetInputSchema.safeParse({
      filePath: '',
    });
    expect(invalid.success).toBe(false);
  });

  it('executes profiling through the Mastra tool and returns validated output schema', async () => {
    expect(profileDatasetTool.execute).toBeDefined();

    const result = await profileDatasetTool.execute!(
      {
        filePath: 'tool_test_sample.csv',
        maxDistinctValues: 1000,
      },
      {} as any
    );

    expect(result).toBeDefined();
    const validatedOutput = profileDatasetOutputSchema.safeParse(result);
    expect(validatedOutput.success).toBe(true);

    if (validatedOutput.success) {
      expect(validatedOutput.data.rowCount).toBe(3);
      expect(validatedOutput.data.columnCount).toBe(4);
      expect(validatedOutput.data.fileName).toBe('tool_test_sample.csv');
    }
  });

  it('registers tool with dataAnalystAgent', async () => {
    expect(dataAnalystAgent).toBeDefined();
    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toBeDefined();
    const tool = agentTools['profileDatasetTool'];
    expect(tool).toBeDefined();
    if (tool && 'id' in tool) {
      expect(tool.id).toBe(PROFILE_DATASET_TOOL_ID);
    }
  });

  it('registers tool on the Mastra application instance', () => {
    expect(mastra).toBeDefined();
    const tool = mastra.getTool('profileDatasetTool');
    expect(tool).toBeDefined();
    expect(tool?.id).toBe(PROFILE_DATASET_TOOL_ID);
  });
});
