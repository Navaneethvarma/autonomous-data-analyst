import { describe, it, expect } from 'vitest';
import {
  BusinessMetricDefinitionSchema,
  BusinessGlossaryTermSchema,
  BusinessContextDocumentSchema,
  MetricResolutionResultSchema,
} from '../../src/lib/semantic/types.js';
import { BusinessMetricResolver } from '../../src/lib/semantic/resolver.js';
import { SemanticRegistry } from '../../src/lib/semantic/registry.js';
import { DatasetColumnInfo } from '../../src/lib/semantic/resolver.js';

describe('Business Semantic Layer & Metric Resolution (Milestone 9)', () => {
  const sampleSalesColumns: DatasetColumnInfo[] = [
    { name: 'transaction_id', inferredType: 'string' },
    { name: 'customer_id', inferredType: 'string' },
    { name: 'transaction_date', inferredType: 'date' },
    { name: 'product_category', inferredType: 'string' },
    { name: 'unit_price', inferredType: 'float' },
    { name: 'quantity', inferredType: 'integer' },
    { name: 'discount_applied', inferredType: 'boolean' },
    { name: 'payment_status', inferredType: 'string' },
  ];

  describe('Zod Schema Validation & Constraints', () => {
    it('validates a well-formed approved business metric definition', () => {
      const metric = {
        metricId: 'metric_test_rev',
        name: 'Gross Sales',
        version: '1.0.0',
        status: 'approved',
        synonyms: ['sales', 'topline'],
        description: 'Total revenue prior to deductions',
        calculationFormula: 'SUM(unit_price * quantity)',
        sqlTemplate: 'SUM(unit_price * quantity)',
        aggregationType: 'sum',
        additivity: 'additive',
        requiredSourceColumns: [
          { name: 'unit_price', compatibleTypes: ['float', 'integer'] },
          { name: 'quantity', compatibleTypes: ['integer'] },
        ],
        permittedDimensions: ['product_category'],
        defaultFilters: [],
        currency: 'USD',
        missingValuePolicy: 'exclude',
        scope: { level: 'application_wide' },
        owner: 'Finance',
      };

      const parsed = BusinessMetricDefinitionSchema.safeParse(metric);
      expect(parsed.success).toBe(true);
    });

    it('validates glossary terms and context document schemas', () => {
      const glossaryTerm = {
        termId: 'term_test',
        term: 'AOV',
        synonyms: ['Average Order Value'],
        definition: 'Average revenue per transaction',
        relatedMetrics: ['metric_aov'],
        scope: { level: 'application_wide' },
      };
      expect(BusinessGlossaryTermSchema.safeParse(glossaryTerm).success).toBe(true);

      const doc = {
        documentId: 'doc_test',
        title: 'Accounting Manual',
        version: '1.0.0',
        category: 'accounting_standard',
        scope: { level: 'application_wide' },
        passages: [
          {
            section: '1.0',
            content: 'Revenue must be computed as price times volume.',
            keywords: ['revenue', 'price'],
          },
        ],
      };
      expect(BusinessContextDocumentSchema.safeParse(doc).success).toBe(true);
    });
  });

  describe('Metric Resolution Workflow', () => {
    const registry = new SemanticRegistry();
    const resolver = new BusinessMetricResolver(registry);

    it('resolves explicit Gross Revenue question grounded in source columns', () => {
      const res = resolver.resolveMetric({
        userQuery: 'What is our gross revenue by product category?',
        datasetColumns: sampleSalesColumns,
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedMetric?.metricId).toBe('metric_gross_revenue');
      expect(res.sqlExpression).toBe('SUM(unit_price * quantity)');
      expect(res.columnMapping).toEqual({
        unit_price: 'unit_price',
        quantity: 'quantity',
      });
      expect(res.missingColumns).toHaveLength(0);
      expect(res.provenance.confidenceScore).toBeGreaterThanOrEqual(0.9);
      expect(MetricResolutionResultSchema.safeParse(res).success).toBe(true);
    });

    it('resolves Average Order Value and enforces non-additive ratio caution', () => {
      const res = resolver.resolveMetric({
        userQuery: 'Show me the average order value across categories',
        datasetColumns: sampleSalesColumns,
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedMetric?.metricId).toBe('metric_average_order_value');
      expect(res.resolvedMetric?.additivity).toBe('non_additive');
      expect(res.resolvedMetric?.aggregationType).toBe('ratio');
      // Warns that non-additive metrics cannot be aggregated via simple arithmetic sum
      expect(res.warnings.some((w) => w.includes('non-additive'))).toBe(true);
    });

    it('detects ambiguity between Gross Revenue and Net Revenue for generic "revenue" query', () => {
      const res = resolver.resolveMetric({
        userQuery: 'What is our total revenue?',
        datasetColumns: sampleSalesColumns,
      });

      expect(res.status).toBe('ambiguous');
      expect(res.conflictingDefinitions).toContain('Gross Revenue');
      expect(res.conflictingDefinitions).toContain('Net Revenue');
      expect(res.clarificationNeeded).toMatch(/matches multiple approved metrics/i);
      expect(res.warnings.some((w) => w.includes('conflicting'))).toBe(true);
    });

    it('flags incompatible schema when required columns are absent from dataset', () => {
      // Columns missing quantity
      const incompleteColumns: DatasetColumnInfo[] = [
        { name: 'transaction_id', inferredType: 'string' },
        { name: 'unit_price', inferredType: 'float' },
      ];

      const res = resolver.resolveMetric({
        userQuery: 'Calculate gross sales revenue',
        datasetColumns: incompleteColumns,
      });

      expect(res.status).toBe('incompatible_schema');
      expect(res.missingColumns).toContain('quantity');
      expect(res.warnings.some((w) => w.includes('Missing required column'))).toBe(true);
      expect(res.sqlExpression).toBeNull();
    });

    it('handles unresolved business concepts as explicitly labeled exploratory', () => {
      const res = resolver.resolveMetric({
        userQuery: 'Calculate the employee viral loop retention coefficient',
        datasetColumns: sampleSalesColumns,
      });

      expect(res.status).toBe('unresolved_exploratory');
      expect(res.resolvedMetric).toBeNull();
      expect(res.warnings.some((w) => w.includes('No approved business metric definition matches'))).toBe(true);
      expect(res.warnings.some((w) => w.includes('must not be presented as certified business KPIs'))).toBe(true);
    });
  });
});
