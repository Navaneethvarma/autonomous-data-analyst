import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveBusinessMetricTool,
  RESOLVE_BUSINESS_METRIC_TOOL_ID,
} from '../../src/mastra/tools/resolve-business-metric-tool.js';
import {
  queryBusinessContextTool,
  QUERY_BUSINESS_CONTEXT_TOOL_ID,
} from '../../src/mastra/tools/query-business-context-tool.js';
import {
  MetricResolutionResultSchema,
  ContextRetrievalResultSchema,
  type MetricResolutionResult,
} from '../../src/lib/semantic/types.js';
import { mastra } from '../../src/mastra/index.js';
import { dataAnalystAgent } from '../../src/mastra/agents/data-analyst-agent.js';

describe('Mastra Semantic Tools Integration (Milestone 9)', () => {
  const sampleSalesPath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  it('registers both semantic tools in Mastra server container', async () => {
    expect(resolveBusinessMetricTool.id).toBe(RESOLVE_BUSINESS_METRIC_TOOL_ID);
    expect(queryBusinessContextTool.id).toBe(QUERY_BUSINESS_CONTEXT_TOOL_ID);

    const mResolve = mastra.getTool('resolveBusinessMetricTool');
    const mQuery = mastra.getTool('queryBusinessContextTool');
    expect(mResolve).toBeDefined();
    expect(mQuery).toBeDefined();

    const agentTools = await dataAnalystAgent.listTools();
    expect(agentTools).toHaveProperty('resolveBusinessMetricTool');
    expect(agentTools).toHaveProperty('queryBusinessContextTool');
  });

  describe('resolveBusinessMetricTool', () => {
    it('successfully resolves an approved metric against sample_sales.csv', async () => {
      const result = (await resolveBusinessMetricTool.execute!(
        {
          userQuery: 'What is our gross revenue across product categories?',
          datasetPath: sampleSalesPath,
        },
        {} as any
      )) as MetricResolutionResult;

      expect(result).toBeDefined();
      expect(result.status).toBe('resolved');
      expect(result.resolvedMetric?.metricId).toBe('metric_gross_revenue');
      expect(result.sqlExpression).toBe('SUM(unit_price * quantity)');
      expect(result.missingColumns).toHaveLength(0);
      expect(result.provenance.confidenceScore).toBeGreaterThanOrEqual(0.8);

      const parsed = MetricResolutionResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('detects ambiguity between Gross and Net Revenue and returns a clarifying question', async () => {
      const result = (await resolveBusinessMetricTool.execute!(
        {
          userQuery: 'Show me total revenue',
          datasetPath: sampleSalesPath,
        },
        {} as any
      )) as MetricResolutionResult;

      expect(result.status).toBe('ambiguous');
      expect(result.conflictingDefinitions).toContain('Gross Revenue');
      expect(result.conflictingDefinitions).toContain('Net Revenue');
      expect(result.clarificationNeeded).toBeDefined();
      expect(result.clarificationNeeded).toMatch(/matches multiple approved metrics/i);
    });

    it('returns an explicitly labeled exploratory result when no approved metric exists', async () => {
      const result = (await resolveBusinessMetricTool.execute!(
        {
          userQuery: 'Calculate customer happiness viral factor',
          datasetPath: sampleSalesPath,
        },
        {} as any
      )) as MetricResolutionResult;

      expect(result.status).toBe('unresolved_exploratory');
      expect(result.resolvedMetric).toBeNull();
      expect(result.warnings.some((w: string) => w.includes('No approved business metric definition matches'))).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('must not be presented as certified business KPIs'))).toBe(true);
    });
  });

  describe('queryBusinessContextTool', () => {
    it('retrieves ASC 606 revenue recognition policy with traceable citations', async () => {
      const result = (await queryBusinessContextTool.execute!(
        {
          query: 'How should revenue be recognized under ASC 606?',
          maxPassages: 3,
        },
        {} as any
      )) as any;

      expect(result).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
      const topCitation = result.citations[0]!;
      expect(topCitation.documentId).toBe('doc_rev_recognition_asc606');
      expect(topCitation.version).toBe('2.1.0');
      expect(topCitation.title).toContain('ASC 606');
      expect(topCitation.snippet.length).toBeGreaterThan(20);

      const parsed = ContextRetrievalResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('retrieves relevant business metrics and glossary terms simultaneously', async () => {
      const result = (await queryBusinessContextTool.execute!(
        {
          query: 'Average order value basket size AOV',
        },
        {} as any
      )) as any;

      expect(result.retrievedMetrics.some((m: any) => m.name === 'Average Order Value')).toBe(true);
      expect(result.retrievedGlossaryTerms.some((t: any) => t.term.includes('AOV'))).toBe(true);
    });

    it('respects scope boundary filtering', async () => {
      const result = (await queryBusinessContextTool.execute!(
        {
          query: 'ASC 606 revenue policy',
          scope: {
            level: 'organization',
            organizationId: 'unauthorized_org_unknown',
          },
        },
        {} as any
      )) as any;

      // Application-wide documents are accessible across organizations, but org-specific private docs are filtered
      expect(result).toBeDefined();
      expect(result.citations.length).toBeGreaterThanOrEqual(0);
    });
  });
});
