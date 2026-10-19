import { describe, it, expect } from 'vitest';
import {
  dataAnalystAgent,
  createDataAnalystAgent,
  DATA_ANALYST_AGENT_ID,
  DATA_ANALYST_AGENT_NAME,
  DATA_ANALYST_INSTRUCTIONS,
} from '../../src/mastra/agents/data-analyst-agent.js';

describe('Data Analyst Agent Configuration', () => {
  it('has stable identifier and descriptive name', () => {
    expect(dataAnalystAgent.id).toBe(DATA_ANALYST_AGENT_ID);
    expect(dataAnalystAgent.name).toBe(DATA_ANALYST_AGENT_NAME);
  });

  it('includes critical analytical instruction invariants', () => {
    // Instruction invariants specified in product engineering standards:
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Clarify ambiguous analytical questions');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Distinguish verified findings from hypotheses');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Never claim to have inspected a dataset unless actual data');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Never invent query results, statistical findings');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('State assumptions explicitly');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Explain analytical and statistical concepts accurately');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Avoid claiming that an analysis is validated unless');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Explain the intended methodology');
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Avoid exposing confidential information');
    // Does not prematurely claim future milestone tools are active
    expect(DATA_ANALYST_INSTRUCTIONS).toContain('Do not claim that automated SQL execution');
  });

  it('allows creating custom agent instances with model override', () => {
    const customAgent = createDataAnalystAgent('openai/gpt-4o-mini');
    expect(customAgent.id).toBe(DATA_ANALYST_AGENT_ID);
    expect(customAgent.name).toBe(DATA_ANALYST_AGENT_NAME);
  });
});
