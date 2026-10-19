import {
  BusinessMetricDefinition,
  BusinessGlossaryTerm,
  BusinessContextDocument,
  ContextScope,
} from './types.js';

/**
 * Checks if a candidate item's scope is accessible by the requested query scope.
 * - 'application_wide' items are accessible to all scopes.
 * - 'organization' items are only accessible within the same organization.
 * - 'dataset_specific' items are only accessible for that specific dataset ID.
 */
export function isScopeAccessible(
  itemScope: ContextScope,
  queryScope: ContextScope
): boolean {
  // Application-wide definitions are always visible
  if (itemScope.level === 'application_wide') {
    return true;
  }

  // Organization-scoped definitions
  if (itemScope.level === 'organization') {
    if (
      queryScope.level === 'organization' ||
      queryScope.level === 'dataset_specific'
    ) {
      return (
        Boolean(itemScope.organizationId) &&
        itemScope.organizationId === queryScope.organizationId
      );
    }
    return false;
  }

  // Dataset-specific definitions
  if (itemScope.level === 'dataset_specific') {
    return (
      Boolean(itemScope.datasetId) &&
      itemScope.datasetId === queryScope.datasetId
    );
  }

  return false;
}

/**
 * Pre-seeded corporate commerce and retail metrics following accounting standards (ASC 606).
 */
export const DEFAULT_BUSINESS_METRICS: BusinessMetricDefinition[] = [
  {
    metricId: 'metric_gross_revenue',
    name: 'Gross Revenue',
    version: '1.0.0',
    status: 'approved',
    synonyms: [
      'revenue',
      'gross sales',
      'total sales',
      'topline revenue',
      'gross receipts',
      'sales',
    ],
    description:
      'Total recognized gross monetary value of merchandise sold prior to discounts, refunds, or cancellations. Requires multiplying unit price by transaction quantity for completed or valid transactions.',
    calculationFormula: 'SUM(unit_price * quantity)',
    sqlTemplate: 'SUM(unit_price * quantity)',
    aggregationType: 'sum',
    additivity: 'additive',
    requiredSourceColumns: [
      {
        name: 'unit_price',
        compatibleTypes: ['float', 'integer'],
        description: 'Gross price per unit sold',
      },
      {
        name: 'quantity',
        compatibleTypes: ['integer', 'float'],
        description: 'Number of units purchased in the transaction',
      },
    ],
    permittedDimensions: [
      'product_category',
      'customer_id',
      'transaction_date',
      'payment_status',
    ],
    defaultFilters: ["payment_status != 'Refunded'"],
    currency: 'USD',
    missingValuePolicy: 'exclude',
    scope: { level: 'application_wide' },
    owner: 'Financial Planning & Accounting Governance',
    sourceDocumentRef: 'doc_rev_recognition_asc606',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    metricId: 'metric_net_revenue',
    name: 'Net Revenue',
    version: '1.0.0',
    status: 'approved',
    synonyms: [
      'revenue',
      'sales',
      'net revenue',
      'net sales',
      'net topline',
      'effective sales',
      'realized revenue',
    ],
    description:
      'Recognized sales revenue exclusively from completed orders after excluding pending, refunded, or failed transactions. If a discount is applied, effective discount factors must be subtracted.',
    calculationFormula:
      'SUM(CASE WHEN discount_applied = true THEN unit_price * quantity * 0.90 ELSE unit_price * quantity END)',
    sqlTemplate:
      "SUM(CASE WHEN discount_applied = true THEN unit_price * quantity * 0.90 ELSE unit_price * quantity END) FILTER (WHERE payment_status = 'Completed')",
    aggregationType: 'sum',
    additivity: 'additive',
    requiredSourceColumns: [
      {
        name: 'unit_price',
        compatibleTypes: ['float', 'integer'],
      },
      {
        name: 'quantity',
        compatibleTypes: ['integer', 'float'],
      },
      {
        name: 'payment_status',
        compatibleTypes: ['string'],
      },
    ],
    permittedDimensions: ['product_category', 'customer_id', 'transaction_date'],
    defaultFilters: ["payment_status = 'Completed'"],
    currency: 'USD',
    missingValuePolicy: 'exclude',
    scope: { level: 'application_wide' },
    owner: 'Revenue Assurance',
    sourceDocumentRef: 'doc_rev_recognition_asc606',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    metricId: 'metric_average_order_value',
    name: 'Average Order Value',
    version: '1.0.0',
    status: 'approved',
    synonyms: ['aov', 'basket size', 'average basket', 'average order size', 'avg order value'],
    description:
      'The average gross revenue per unique transaction or order. As a ratio/mean metric, it is non-additive across categories and cannot be aggregated by simple summation.',
    calculationFormula: 'SUM(unit_price * quantity) / COUNT(DISTINCT transaction_id)',
    sqlTemplate: 'SUM(unit_price * quantity) / NULLIF(COUNT(DISTINCT transaction_id), 0)',
    aggregationType: 'ratio',
    additivity: 'non_additive',
    requiredSourceColumns: [
      {
        name: 'unit_price',
        compatibleTypes: ['float', 'integer'],
      },
      {
        name: 'quantity',
        compatibleTypes: ['integer', 'float'],
      },
      {
        name: 'transaction_id',
        compatibleTypes: ['string', 'integer'],
      },
    ],
    permittedDimensions: ['product_category', 'customer_id', 'transaction_date'],
    defaultFilters: [],
    currency: 'USD',
    missingValuePolicy: 'exclude',
    scope: { level: 'application_wide' },
    owner: 'Commercial Analytics Group',
    sourceDocumentRef: 'doc_ecommerce_kpi_handbook',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    metricId: 'metric_order_volume',
    name: 'Order Volume',
    version: '1.0.0',
    status: 'approved',
    synonyms: ['total orders', 'order count', 'transaction count', 'number of orders', 'volume'],
    description: 'Total count of distinct transaction orders processed.',
    calculationFormula: 'COUNT(DISTINCT transaction_id)',
    sqlTemplate: 'COUNT(DISTINCT transaction_id)',
    aggregationType: 'distinct_count',
    additivity: 'additive',
    requiredSourceColumns: [
      {
        name: 'transaction_id',
        compatibleTypes: ['string', 'integer'],
      },
    ],
    permittedDimensions: ['product_category', 'payment_status', 'transaction_date'],
    defaultFilters: [],
    unit: 'orders',
    missingValuePolicy: 'exclude',
    scope: { level: 'application_wide' },
    owner: 'Commercial Operations',
    sourceDocumentRef: 'doc_ecommerce_kpi_handbook',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    metricId: 'metric_total_units_sold',
    name: 'Total Units Sold',
    version: '1.0.0',
    status: 'approved',
    synonyms: ['units sold', 'total quantity', 'volume of units', 'items purchased'],
    description: 'Sum of all physical product units purchased across orders.',
    calculationFormula: 'SUM(quantity)',
    sqlTemplate: 'SUM(quantity)',
    aggregationType: 'sum',
    additivity: 'additive',
    requiredSourceColumns: [
      {
        name: 'quantity',
        compatibleTypes: ['integer', 'float'],
      },
    ],
    permittedDimensions: ['product_category', 'customer_id', 'transaction_date'],
    defaultFilters: [],
    unit: 'units',
    missingValuePolicy: 'treat_as_zero',
    scope: { level: 'application_wide' },
    owner: 'Supply Chain & Inventory',
    sourceDocumentRef: 'doc_ecommerce_kpi_handbook',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    metricId: 'metric_refund_rate',
    name: 'Refund Rate',
    version: '1.0.0',
    status: 'approved',
    synonyms: ['return rate', 'refund percentage', 'cancellation rate'],
    description:
      'Percentage of total transactions with payment_status = "Refunded". Non-additive ratio metric.',
    calculationFormula:
      "(COUNT(CASE WHEN payment_status = 'Refunded' THEN 1 END) * 100.0) / COUNT(*)",
    sqlTemplate:
      "(COUNT(*) FILTER (WHERE payment_status = 'Refunded') * 100.0) / NULLIF(COUNT(*), 0)",
    aggregationType: 'ratio',
    additivity: 'non_additive',
    requiredSourceColumns: [
      {
        name: 'payment_status',
        compatibleTypes: ['string'],
      },
    ],
    permittedDimensions: ['product_category', 'transaction_date'],
    defaultFilters: [],
    unit: '%',
    missingValuePolicy: 'exclude',
    scope: { level: 'application_wide' },
    owner: 'Customer Care & Risk Management',
    sourceDocumentRef: 'doc_rev_recognition_asc606',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
];

/**
 * Pre-seeded corporate glossary definitions.
 */
export const DEFAULT_GLOSSARY_TERMS: BusinessGlossaryTerm[] = [
  {
    termId: 'term_revenue',
    term: 'Revenue',
    synonyms: ['Sales', 'Gross Receipts', 'Topline'],
    definition:
      'The monetary consideration recognized from commercial sales of goods or services. In accordance with corporate governance, revenue must be computed as unit price multiplied by quantity, never inferred from isolated price columns alone.',
    relatedMetrics: ['metric_gross_revenue', 'metric_net_revenue'],
    scope: { level: 'application_wide' },
    examples: ['Gross revenue = unit_price * quantity', 'Net revenue = Gross revenue - discounts/refunds'],
    authoritativeSource: 'ASC 606 Revenue from Contracts with Customers',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    termId: 'term_aov',
    term: 'AOV (Average Order Value)',
    synonyms: ['Average Basket', 'Basket Size', 'Order Average'],
    definition:
      'A key operational performance ratio tracking average monetization per transaction. As a non-additive metric, AOV for combined segments must be computed from aggregate revenue divided by aggregate order count, never by averaging subset AOVs.',
    relatedMetrics: ['metric_average_order_value'],
    scope: { level: 'application_wide' },
    examples: ['Total Sales / Total Orders'],
    authoritativeSource: 'E-Commerce Standard KPI Playbook',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    termId: 'term_completed_transaction',
    term: 'Completed Transaction',
    synonyms: ['Settled Order', 'Fulfilled Order', 'Realized Sale'],
    definition:
      'A transaction with payment_status = "Completed", indicating funds have settled and commercial delivery obligation is binding.',
    relatedMetrics: ['metric_net_revenue'],
    scope: { level: 'application_wide' },
    examples: ['payment_status == "Completed"'],
    authoritativeSource: 'Payment Operations & Settlement Policy',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    termId: 'term_additivity',
    term: 'Metric Additivity',
    synonyms: ['Aggregation Rule', 'Rollup Semantics'],
    definition:
      'Classification of whether a metric can be validly rolled up by summation across groups. Additive metrics (totals, counts) allow SUM; non-additive metrics (averages, ratios, percentages, margins) cannot be summed across categories.',
    relatedMetrics: ['metric_average_order_value', 'metric_refund_rate'],
    scope: { level: 'application_wide' },
    examples: ['Averages cannot be summed across product categories; they must be recomputed on pooled data.'],
    authoritativeSource: 'Analytical Governance Manual',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
];

/**
 * Pre-seeded corporate business context documents.
 */
export const DEFAULT_CONTEXT_DOCUMENTS: BusinessContextDocument[] = [
  {
    documentId: 'doc_rev_recognition_asc606',
    title: 'Corporate Revenue Recognition Policy (ASC 606 Standards)',
    version: '2.1.0',
    category: 'accounting_standard',
    scope: { level: 'application_wide' },
    effectiveDate: '2025-01-01',
    owner: 'Corporate Accounting Standards Board',
    passages: [
      {
        section: '1.1 Revenue Formulation',
        content:
          'Gross revenue must be recognized as the product of gross unit price and quantity sold for all authorized transactions. Revenue must never be calculated using standalone unit price without quantity multiplication.',
        keywords: ['revenue', 'formula', 'unit_price', 'quantity', 'gross revenue'],
      },
      {
        section: '1.2 Status Exclusions',
        content:
          'Net revenue excludes transactions with payment_status of Refunded, Failed, or Cancelled. For completed transactions where discount_applied is true, effective realized net revenue reflects standard contracted promotional rates.',
        keywords: ['net revenue', 'refunded', 'discounts', 'payment_status', 'completed'],
      },
      {
        section: '1.3 Non-Additive Metrics',
        content:
          'Rates, proportions, and average unit values must never be aggregated across categories via simple arithmetic addition. Any combined summary must recalculate the numerator and denominator totals independently.',
        keywords: ['non_additive', 'ratio', 'averaging', 'aggregation', 'rollup'],
      },
    ],
  },
  {
    documentId: 'doc_ecommerce_kpi_handbook',
    title: 'E-Commerce KPI & Commercial Metric Handbook',
    version: '1.4.0',
    category: 'kpi_handbook',
    scope: { level: 'application_wide' },
    effectiveDate: '2025-06-01',
    owner: 'Commercial Intelligence Team',
    passages: [
      {
        section: '2.1 Average Order Value (AOV)',
        content:
          'Average Order Value is defined as total transaction revenue divided by the distinct count of order identifiers. AOV cannot be summed across product categories or customer segments.',
        keywords: ['aov', 'average order value', 'basket', 'distinct', 'transaction_id'],
      },
      {
        section: '2.2 Refund and Return Measurement',
        content:
          'Refund rate is the percentage of all initiated transactions that resulted in a refund status. High refund rates (>5%) indicate quality defects or customer expectation mismatches.',
        keywords: ['refund rate', 'returns', 'cancellation', 'quality', 'defects'],
      },
    ],
  },
];

/**
 * In-memory Semantic Catalog and Registry.
 */
export class SemanticRegistry {
  private metrics: Map<string, BusinessMetricDefinition> = new Map();
  private glossary: Map<string, BusinessGlossaryTerm> = new Map();
  private documents: Map<string, BusinessContextDocument> = new Map();

  constructor() {
    this.resetToDefaults();
  }

  public resetToDefaults(): void {
    this.metrics.clear();
    this.glossary.clear();
    this.documents.clear();

    for (const m of DEFAULT_BUSINESS_METRICS) {
      this.metrics.set(m.metricId, m);
    }
    for (const g of DEFAULT_GLOSSARY_TERMS) {
      this.glossary.set(g.termId, g);
    }
    for (const d of DEFAULT_CONTEXT_DOCUMENTS) {
      this.documents.set(d.documentId, d);
    }
  }

  public registerMetric(metric: BusinessMetricDefinition): void {
    this.metrics.set(metric.metricId, metric);
  }

  public registerGlossaryTerm(term: BusinessGlossaryTerm): void {
    this.glossary.set(term.termId, term);
  }

  public registerContextDocument(doc: BusinessContextDocument): void {
    const fullDoc: BusinessContextDocument = {
      version: '1.0.0',
      owner: 'Corporate Governance',
      scope: { level: 'application_wide' },
      ...doc,
    };
    this.documents.set(fullDoc.documentId, fullDoc);
  }

  public getMetricById(metricId: string, queryScope?: ContextScope): BusinessMetricDefinition | undefined {
    const metric = this.metrics.get(metricId);
    if (!metric) return undefined;
    if (queryScope && !isScopeAccessible(metric.scope, queryScope)) {
      return undefined;
    }
    return metric;
  }

  public getAllMetrics(queryScope?: ContextScope): BusinessMetricDefinition[] {
    const all = Array.from(this.metrics.values());
    if (!queryScope) return all;
    return all.filter((m) => isScopeAccessible(m.scope, queryScope));
  }

  public getAllGlossaryTerms(queryScope?: ContextScope): BusinessGlossaryTerm[] {
    const all = Array.from(this.glossary.values());
    if (!queryScope) return all;
    return all.filter((t) => isScopeAccessible(t.scope, queryScope));
  }

  public getAllContextDocuments(queryScope?: ContextScope): BusinessContextDocument[] {
    const all = Array.from(this.documents.values());
    if (!queryScope) return all;
    return all.filter((d) => isScopeAccessible(d.scope ?? { level: 'application_wide' }, queryScope));
  }
}

export const defaultSemanticRegistry = new SemanticRegistry();
