import {
  ContextRetrievalQuery,
  ContextRetrievalResult,
  ContextCitation,
  BusinessMetricDefinition,
  BusinessGlossaryTerm,
  ContextScope,
} from './types.js';
import { SemanticRegistry, defaultSemanticRegistry } from './registry.js';

/**
 * TRUST BOUNDARY ARCHITECTURAL PRINCIPLE:
 * Retrieved documents, glossary text, dataset values, and user queries are untrusted external data.
 * Lexical sanitization provides defense-in-depth against instruction hijacking and prompt injection,
 * but sanitization is NOT treated as the sole security boundary.
 * 
 * Downstream execution controls (read-only SQL AST validator, table authorization whitelisting,
 * DuckDB external access lockdown, subprocess credential scrubbing, and timeout bounds)
 * are strictly enforced regardless of prompt content and cannot be overridden by untrusted text.
 */
export function sanitizeRetrievedText(rawText: string): string {
  if (!rawText) return '';

  return (
    rawText
      // Strip common LLM chat control markers and instruction hijacking attempts
      .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, '[REDACTED_CONTROL_BLOCK]')
      .replace(/<\|system\|>/gi, '[REDACTED]')
      .replace(/<\|user\|>/gi, '[REDACTED]')
      .replace(/<\|assistant\|>/gi, '[REDACTED]')
      .replace(/<\|[a-z0-9_-]+\|>/gi, '[REDACTED]')
      .replace(
        /\b(ignore (all )?(previous|prior) instructions|disregard (all )?(previous|system) instructions|disregard system prompt|bypass (all )?security|system override|override (all )?system rules|reveal system prompt|show secret keys?|expose credentials|print environment variables)\b/gi,
        '[DISALLOWED_INSTRUCTION_FILTERED]'
      )
      .trim()
  );
}

/**
 * Calculates a deterministic lexical overlap score between query tokens and text.
 */
function computeLexicalRelevance(queryTokens: Set<string>, targetText: string, keywords: string[] = []): number {
  if (queryTokens.size === 0) return 0.0;

  const normalizedTarget = targetText.toLowerCase();
  let matches = 0;

  for (const token of queryTokens) {
    if (normalizedTarget.includes(token)) {
      matches += 1.0;
    }
  }

  // Bonus weight for exact keyword matches
  let keywordBonus = 0;
  for (const kw of keywords) {
    if (queryTokens.has(kw.toLowerCase())) {
      keywordBonus += 0.5;
    }
  }

  const rawScore = (matches + keywordBonus) / (queryTokens.size + 1.0);
  return Math.min(1.0, Math.max(0.0, rawScore));
}

/**
 * Grounded context retrieval engine.
 */
export class BusinessContextRetriever {
  private registry: SemanticRegistry;

  constructor(registry: SemanticRegistry = defaultSemanticRegistry) {
    this.registry = registry;
  }

  /**
   * Retrieves relevant business documents, definitions, and glossary entries
   * for a query within authorized scope boundaries.
   */
  public retrieveContext(queryReq: ContextRetrievalQuery): ContextRetrievalResult {
    const startTime = Date.now();
    const query = queryReq.query.trim().toLowerCase();
    const queryTokens = new Set(
      query
        .split(/[^a-zA-Z0-9_\-]+/)
        .filter((t) => t.length > 2)
    );

    const scope: ContextScope = queryReq.scope || { level: 'application_wide' };
    const maxResults = queryReq.maxResults || queryReq.maxPassages || 5;

    // 1. Retrieve & Score Document Passages
    const allDocs = this.registry.getAllContextDocuments(scope);
    const candidateCitations: ContextCitation[] = [];

    for (const doc of allDocs) {
      if (queryReq.categories && !queryReq.categories.includes(doc.category)) {
        continue;
      }

      for (const passage of doc.passages) {
        const textToMatch = `${doc.title} ${passage.section} ${passage.content} ${passage.keywords.join(' ')}`;
        const score = computeLexicalRelevance(queryTokens, textToMatch, passage.keywords);

        if (score > 0.15) {
          candidateCitations.push({
            documentId: doc.documentId,
            title: doc.title,
            version: doc.version ?? '1.0.0',
            section: passage.section,
            snippet: sanitizeRetrievedText(passage.content),
            relevanceScore: Math.round(score * 1000) / 1000,
            scope: doc.scope ?? { level: 'application_wide' },
          });
        }
      }
    }

    // Sort citations descending by relevance score
    candidateCitations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topCitations = candidateCitations.slice(0, maxResults);

    // 2. Retrieve & Score Relevant Metrics
    const allMetrics = this.registry.getAllMetrics(scope);
    const matchingMetrics: { metric: BusinessMetricDefinition; score: number }[] = [];

    for (const m of allMetrics) {
      const searchBlob = `${m.name} ${m.synonyms.join(' ')} ${m.description} ${m.calculationFormula}`.toLowerCase();
      const score = computeLexicalRelevance(queryTokens, searchBlob, m.synonyms);
      if (score > 0.2) {
        matchingMetrics.push({ metric: m, score });
      }
    }
    matchingMetrics.sort((a, b) => b.score - a.score);
    const topMetrics = matchingMetrics.slice(0, maxResults).map((item) => item.metric);

    // 3. Retrieve & Score Relevant Glossary Terms
    const allTerms = this.registry.getAllGlossaryTerms(scope);
    const matchingTerms: { term: BusinessGlossaryTerm; score: number }[] = [];

    for (const t of allTerms) {
      const searchBlob = `${t.term} ${t.synonyms.join(' ')} ${t.definition}`.toLowerCase();
      const score = computeLexicalRelevance(queryTokens, searchBlob, t.synonyms);
      if (score > 0.2) {
        matchingTerms.push({ term: t, score });
      }
    }
    matchingTerms.sort((a, b) => b.score - a.score);
    const topTerms = matchingTerms.slice(0, maxResults).map((item) => item.term);

    const totalFound = topCitations.length + topMetrics.length + topTerms.length;

    return {
      query: queryReq.query,
      citations: topCitations,
      retrievedMetrics: topMetrics,
      retrievedGlossaryTerms: topTerms,
      totalFound,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export const defaultContextRetriever = new BusinessContextRetriever();
