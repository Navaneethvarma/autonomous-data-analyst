import { describe, it, expect } from 'vitest';
import { mastra } from '../../src/mastra/index.js';
import { DATA_ANALYST_AGENT_ID, DATA_ANALYST_AGENT_NAME } from '../../src/mastra/agents/data-analyst-agent.js';

describe('Mastra Application Registration', () => {
  it('registers the Data Analyst Agent on the Mastra instance', () => {
    expect(mastra).toBeDefined();

    const agent = mastra.getAgent('dataAnalystAgent');
    expect(agent).toBeDefined();
    expect(agent.id).toBe(DATA_ANALYST_AGENT_ID);
    expect(agent.name).toBe(DATA_ANALYST_AGENT_NAME);
  });

  it('exposes generation and streaming interface on the registered agent', () => {
    const agent = mastra.getAgent('dataAnalystAgent');
    expect(typeof agent.generate).toBe('function');
    expect(typeof agent.stream).toBe('function');
  });
});
