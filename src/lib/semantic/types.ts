import { z } from 'zod';

/**
 * Metric additivity classification to prevent invalid aggregations.
 * - 'additive': Can be summed across all dimensions (e.g., total sales, transaction count).
 * - 'semi_additive': Can be summed across some dimensions (e.g., geography) but not time (e.g., inventory balance).
 * - 'non_additive': Cannot be summed across any dimension (e.g., ratios, unit price, averages, percentages).
 */
export const MetricAdditivitySchema = z.enum([
  'additive',
  'semi_additive',
  'non_additive',
]);
export type MetricAdditivity = z.infer<typeof MetricAdditivitySchema>;

/**
 * Standard aggregation methods supported by the semantic engine.
 */
export const AggregationTypeSchema = z.enum([
  'sum',
  'count',
  'distinct_count',
  'average',
  'ratio',
  'weighted_average',
  'min',
  'max',
  'custom',
]);
export type AggregationType = z.infer<typeof AggregationTypeSchema>;

/**
 * Hierarchical scoping for tenant, organization, and dataset isolation.
 */
export const ContextScopeLevelSchema = z.enum([
  'application_wide',
  'organization',
  'dataset_specific',
]);
export type ContextScopeLevel = z.infer<typeof ContextScopeLevelSchema>;

export const ContextScopeSchema = z.object({
  level: ContextScopeLevelSchema,
  organizationId: z.string().optional(),
  datasetId: z.string().optional(),
});
export type ContextScope = z.infer<typeof ContextScopeSchema>;

/**
 * Specification of a source column required to compute a metric.
 */
export const MetricSourceColumnSchema = z.object({
  name: z.string().min(1),
  compatibleTypes: z.array(z.enum(['integer', 'float', 'boolean', 'date', 'datetime', 'string'])),
  description: z.string().optional(),
});
export type MetricSourceColumn = z.infer<typeof MetricSourceColumnSchema>;

/**
 * Authoritative business metric definition.
 */
export const BusinessMetricDefinitionSchema = z.object({
  metricId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  status: z.enum(['approved', 'draft', 'deprecated']).default('approved'),
  synonyms: z.array(z.string()).default([]),
  description: z.string().min(1),
  calculationFormula: z.string().min(1),
  sqlTemplate: z.string().min(1),
  aggregationType: AggregationTypeSchema,
  additivity: MetricAdditivitySchema,
  requiredSourceColumns: z.array(MetricSourceColumnSchema).min(1),
  permittedDimensions: z.array(z.string()).default([]),
  defaultFilters: z.array(z.string()).default([]),
  unit: z.string().optional(),
  currency: z.string().optional(),
  missingValuePolicy: z.enum(['exclude', 'treat_as_zero', 'error']).default('exclude'),
  scope: ContextScopeSchema.default({ level: 'application_wide' }),
  owner: z.string().default('Finance & Analytics Governance'),
  sourceDocumentRef: z.string().optional(),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type BusinessMetricDefinition = z.infer<typeof BusinessMetricDefinitionSchema>;

/**
 * Glossary entry mapping business terminology and concepts.
 */
export const BusinessGlossaryTermSchema = z.object({
  termId: z.string().min(1),
  term: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  definition: z.string().min(1),
  relatedMetrics: z.array(z.string()).default([]),
  scope: ContextScopeSchema.default({ level: 'application_wide' }),
  examples: z.array(z.string()).default([]),
  authoritativeSource: z.string().optional(),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type BusinessGlossaryTerm = z.infer<typeof BusinessGlossaryTermSchema>;

/**
 * Approved business context document (policy, accounting rule, calculation guide).
 */
export const BusinessContextDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  version: z.string().optional().default('1.0.0'),
  category: z.enum(['policy', 'accounting_standard', 'glossary', 'kpi_handbook', 'data_dictionary']),
  scope: ContextScopeSchema.optional().default({ level: 'application_wide' }),
  passages: z.array(
    z.object({
      section: z.string(),
      content: z.string(),
      keywords: z.array(z.string()),
    })
  ),
  effectiveDate: z.string().optional(),
  owner: z.string().optional().default('Corporate Governance'),
});
export type BusinessContextDocument = z.input<typeof BusinessContextDocumentSchema>;
export type BusinessContextDocumentResolved = z.infer<typeof BusinessContextDocumentSchema>;

/**
 * Grounded metric resolution outcome.
 */
export const MetricResolutionResultSchema = z.object({
  contractVersion: z.literal('1.0.0').default('1.0.0'),
  status: z.enum([
    'resolved',
    'ambiguous',
    'unresolved_exploratory',
    'incompatible_schema',
  ]),
  userQuery: z.string(),
  detectedConcept: z.string(),
  resolvedMetric: BusinessMetricDefinitionSchema.nullable().optional(),
  applicableGlossaryTerms: z.array(BusinessGlossaryTermSchema).default([]),
  columnMapping: z.record(z.string(), z.string()).default({}),
  sqlExpression: z.string().nullable().optional(),
  clarificationNeeded: z.string().nullable().optional(),
  conflictingDefinitions: z.array(z.string()).default([]),
  missingColumns: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  provenance: z.object({
    resolvedAt: z.string(),
    scopeUsed: ContextScopeSchema,
    matchedSynonyms: z.array(z.string()),
    confidenceScore: z.number().min(0).max(1),
    sourceCitations: z.array(z.string()),
  }),
});
export type MetricResolutionResult = z.infer<typeof MetricResolutionResultSchema>;

/**
 * Context retrieval query request.
 */
export const ContextRetrievalQuerySchema = z.object({
  query: z.string().min(1),
  scope: ContextScopeSchema.optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
  maxPassages: z.number().int().min(1).max(20).optional(),
  categories: z.array(z.string()).optional(),
});
export type ContextRetrievalQuery = z.infer<typeof ContextRetrievalQuerySchema>;

/**
 * Retrieved citation and passage.
 */
export const ContextCitationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  version: z.string(),
  section: z.string(),
  snippet: z.string(),
  relevanceScore: z.number().min(0).max(1),
  scope: ContextScopeSchema,
});
export type ContextCitation = z.infer<typeof ContextCitationSchema>;

export const ContextRetrievalResultSchema = z.object({
  query: z.string(),
  citations: z.array(ContextCitationSchema),
  retrievedMetrics: z.array(BusinessMetricDefinitionSchema),
  retrievedGlossaryTerms: z.array(BusinessGlossaryTermSchema),
  totalFound: z.number(),
  executionTimeMs: z.number(),
});
export type ContextRetrievalResult = z.infer<typeof ContextRetrievalResultSchema>;
