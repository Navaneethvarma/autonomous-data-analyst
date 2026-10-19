import {
  BusinessMetricDefinition,
  MetricResolutionResult,
  ContextScope,
  BusinessGlossaryTerm,
} from './types.js';
import { SemanticRegistry, defaultSemanticRegistry } from './registry.js';
import { BusinessContextRetriever, defaultContextRetriever } from './retrieval.js';
import { InferredDataType } from '../dataset/types.js';

export interface DatasetColumnInfo {
  name: string;
  inferredType: InferredDataType;
}

export interface MetricResolutionRequest {
  userQuery: string;
  datasetColumns: DatasetColumnInfo[];
  scope?: ContextScope;
  dimensionColumns?: string[];
  filterExpressions?: string[];
}

/**
 * Normalizes text for term and synonym matching.
 */
function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a dataset column type is compatible with required types.
 */
function isTypeCompatible(actualType: InferredDataType, compatibleTypes: string[]): boolean {
  if (compatibleTypes.includes(actualType)) return true;
  // Permissive numeric casting
  if ((actualType === 'integer' || actualType === 'float') && compatibleTypes.includes('float')) return true;
  if (actualType === 'integer' && compatibleTypes.includes('integer')) return true;
  return false;
}

/**
 * Grounded Metric Resolution Engine.
 */
export class BusinessMetricResolver {
  private registry: SemanticRegistry;
  private retriever: BusinessContextRetriever;

  constructor(
    registry: SemanticRegistry = defaultSemanticRegistry,
    retriever: BusinessContextRetriever = defaultContextRetriever
  ) {
    this.registry = registry;
    this.retriever = retriever;
  }

  /**
   * Resolves a user business query against approved metrics, glossary, and dataset schema.
   */
  public resolveMetric(req: MetricResolutionRequest): MetricResolutionResult {
    const rawQuery = req.userQuery;
    const normalized = normalizeQuery(rawQuery);
    const scope = req.scope || { level: 'application_wide' };
    const datasetColMap = new Map<string, InferredDataType>();
    for (const c of req.datasetColumns) {
      datasetColMap.set(c.name.toLowerCase(), c.inferredType);
    }

    // 1. Context Retrieval for supporting glossary and citations
    const retrieved = this.retriever.retrieveContext({
      query: rawQuery,
      scope,
      maxResults: 3,
    });

    const applicableGlossary: BusinessGlossaryTerm[] = [];
    const sourceCitations: string[] = [];
    for (const c of retrieved.citations) {
      sourceCitations.push(`${c.title} (${c.section}) [v${c.version}]`);
    }

    for (const t of this.registry.getAllGlossaryTerms(scope)) {
      const termNorm = normalizeQuery(t.term);
      if (normalized.includes(termNorm) || t.synonyms.some((s) => normalized.includes(normalizeQuery(s)))) {
        applicableGlossary.push(t);
      }
    }

    // 2. Candidate Metric Matching & Scoring
    const allMetrics = this.registry.getAllMetrics(scope);
    const candidates: {
      metric: BusinessMetricDefinition;
      score: number;
      matchedSynonyms: string[];
    }[] = [];

    for (const m of allMetrics) {
      const metricNameNorm = normalizeQuery(m.name);
      let score = 0;
      const matchedSynonyms: string[] = [];

      // Exact name match
      if (normalized.includes(metricNameNorm)) {
        score += 1.0;
        matchedSynonyms.push(m.name);
      }

      // Synonym match
      for (const syn of m.synonyms) {
        const synNorm = normalizeQuery(syn);
        if (normalized.includes(synNorm)) {
          score += 0.8;
          matchedSynonyms.push(syn);
        }
      }

      if (score > 0) {
        candidates.push({ metric: m, score, matchedSynonyms });
      }
    }

    // Sort candidates descending by score
    candidates.sort((a, b) => b.score - a.score);

    // 3. Scenario: No candidate metrics matched
    if (candidates.length === 0) {
      return {
        contractVersion: '1.0.0',
        status: 'unresolved_exploratory',
        userQuery: rawQuery,
        detectedConcept: 'Unregistered business concept',
        resolvedMetric: null,
        applicableGlossaryTerms: applicableGlossary,
        columnMapping: {},
        sqlExpression: null,
        clarificationNeeded: null,
        conflictingDefinitions: [],
        missingColumns: [],
        warnings: [
          'No approved business metric definition matches the requested question in the authorized semantic registry.',
          'Calculations performed without an approved definition are exploratory and must not be presented as certified business KPIs.',
        ],
        limitations: [
          'Lacks authoritative corporate governance formula, target, and accounting policy alignment.',
        ],
        provenance: {
          resolvedAt: new Date().toISOString(),
          scopeUsed: scope,
          matchedSynonyms: [],
          confidenceScore: 0.0,
          sourceCitations,
        },
      };
    }

    // 4. Scenario: Ambiguity Detection (e.g. "Gross Revenue" vs "Net Revenue" when user asks generic "revenue")
    if (
      candidates.length >= 2 &&
      candidates[0] &&
      candidates[1] &&
      Math.abs(candidates[0].score - candidates[1].score) < 0.25
    ) {
      const topA = candidates[0].metric;
      const topB = candidates[1].metric;

      // Check if one is Gross and one is Net
      const conflictingNames = [topA.name, topB.name];
      const clarification =
        `The question asks about '${rawQuery.trim()}', which matches multiple approved metrics: ` +
        `'${topA.name}' (${topA.description}) and '${topB.name}' (${topB.description}). ` +
        `Would you like to analyze ${topA.name} or ${topB.name}?`;

      return {
        contractVersion: '1.0.0',
        status: 'ambiguous',
        userQuery: rawQuery,
        detectedConcept: `${topA.name} vs ${topB.name}`,
        resolvedMetric: topA, // default fallback candidate
        applicableGlossaryTerms: applicableGlossary,
        columnMapping: {},
        sqlExpression: topA.sqlTemplate,
        clarificationNeeded: clarification,
        conflictingDefinitions: conflictingNames,
        missingColumns: [],
        warnings: [
          `Multiple conflicting business metric definitions match the query with similar relevance: [${conflictingNames.join(', ')}].`,
        ],
        limitations: [
          'Selecting an arbitrary interpretation without user clarification may produce materially divergent commercial metrics.',
        ],
        provenance: {
          resolvedAt: new Date().toISOString(),
          scopeUsed: scope,
          matchedSynonyms: [...candidates[0].matchedSynonyms, ...candidates[1].matchedSynonyms],
          confidenceScore: 0.5,
          sourceCitations,
        },
      };
    }

    // 5. Select Best Candidate & Validate Dataset Compatibility
    const selected = candidates[0]!.metric;
    const matchedSynonyms = candidates[0]!.matchedSynonyms;
    const missingCols: string[] = [];
    const incompatibleTypeCols: string[] = [];
    const colMapping: Record<string, string> = {};

    for (const reqCol of selected.requiredSourceColumns) {
      const actualType = datasetColMap.get(reqCol.name.toLowerCase());
      if (actualType === undefined) {
        missingCols.push(reqCol.name);
      } else if (!isTypeCompatible(actualType, reqCol.compatibleTypes)) {
        incompatibleTypeCols.push(
          `${reqCol.name} (found: ${actualType}, required: ${reqCol.compatibleTypes.join('|')})`
        );
      } else {
        colMapping[reqCol.name] = reqCol.name;
      }
    }

    if (missingCols.length > 0 || incompatibleTypeCols.length > 0) {
      const allErrors: string[] = [];
      if (missingCols.length > 0) {
        allErrors.push(`Missing required column(s): [${missingCols.join(', ')}]`);
      }
      if (incompatibleTypeCols.length > 0) {
        allErrors.push(`Incompatible column types: [${incompatibleTypeCols.join(', ')}]`);
      }

      return {
        contractVersion: '1.0.0',
        status: 'incompatible_schema',
        userQuery: rawQuery,
        detectedConcept: selected.name,
        resolvedMetric: selected,
        applicableGlossaryTerms: applicableGlossary,
        columnMapping: colMapping,
        sqlExpression: null,
        clarificationNeeded: `Dataset is missing required columns to compute approved metric '${selected.name}'. Missing: ${missingCols.join(', ')}.`,
        conflictingDefinitions: [],
        missingColumns: missingCols,
        warnings: allErrors,
        limitations: [
          `Cannot compute approved metric '${selected.name}' due to dataset schema deficiency.`,
        ],
        provenance: {
          resolvedAt: new Date().toISOString(),
          scopeUsed: scope,
          matchedSynonyms,
          confidenceScore: 0.3,
          sourceCitations,
        },
      };
    }

    // 6. Additivity and Grouping Validation
    const warnings: string[] = [];
    const limitations: string[] = [];

    if (selected.additivity === 'non_additive') {
      warnings.push(
        `Metric '${selected.name}' is non-additive (${selected.aggregationType}). Do not compute cross-group rollups by arithmetic summation; recalculate independently from component sums.`
      );
    }

    // Build grounded SQL expression
    let finalSql = selected.sqlTemplate;
    if (selected.defaultFilters.length > 0 && req.filterExpressions) {
      warnings.push(`Standard metric policy applies default filters: [${selected.defaultFilters.join(' AND ')}]`);
    }

    return {
      contractVersion: '1.0.0',
      status: 'resolved',
      userQuery: rawQuery,
      detectedConcept: selected.name,
      resolvedMetric: selected,
      applicableGlossaryTerms: applicableGlossary,
      columnMapping: colMapping,
      sqlExpression: finalSql,
      clarificationNeeded: null,
      conflictingDefinitions: [],
      missingColumns: [],
      warnings,
      limitations,
      provenance: {
        resolvedAt: new Date().toISOString(),
        scopeUsed: scope,
        matchedSynonyms,
        confidenceScore: 0.95,
        sourceCitations,
      },
    };
  }
}

export const defaultMetricResolver = new BusinessMetricResolver();
