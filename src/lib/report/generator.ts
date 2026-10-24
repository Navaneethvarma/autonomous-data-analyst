import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import type {
  EdaAndInsightsResult,
  DatasetEdaSummary,
  BusinessInsight,
} from '../analytics/eda-types.js';
import {
  REPORT_SCHEMA_VERSION,
  ReportSpecSchema,
  type ReportSpec,
} from './types.js';
import {
  type GenerateReportOptions,
  buildReportMetadata,
  buildReportExecutiveSummary,
  buildReportKpis,
  buildQualityAssessment,
  buildReportFindings,
  buildReportCharts,
  buildReportTables,
  buildStatisticalAnalysis,
  buildReportMethodology,
  getReportAppendix,
} from './report-spec-builders.js';

export type { GenerateReportOptions };

/**
 * Pure generator that constructs a verified ReportSpec from computed EDA results.
 */
export function buildReportSpecFromEda(
  input: EdaAndInsightsResult | DatasetEdaSummary,
  options?: GenerateReportOptions
): ReportSpec {
  let eda: DatasetEdaSummary;
  let insights: BusinessInsight[];
  let provenance: { datasetFile: string; analyzedAt: string; executionTimeMs: number; engine: string };

  if ('eda' in input && 'insights' in input && 'provenance' in input) {
    eda = input.eda;
    insights = input.insights;
    provenance = input.provenance;
  } else {
    eda = input as DatasetEdaSummary;
    insights = generateBusinessInsights(eda);
    provenance = {
      datasetFile: eda.datasetName,
      analyzedAt: eda.analyzedAt,
      executionTimeMs: eda.executionTimeMs,
      engine: 'DuckDB Embedded SQL & Statistical Profiler',
    };
  }

  const metadata = buildReportMetadata(eda, provenance, options);
  const executiveSummary = buildReportExecutiveSummary(eda, insights);
  const kpis = buildReportKpis(eda);
  const qualityAssessment = buildQualityAssessment(eda);
  const findings = buildReportFindings(insights);
  const charts = buildReportCharts(eda);
  const tables = buildReportTables(eda);
  const statisticalAnalysis = buildStatisticalAnalysis(eda);
  const methodology = buildReportMethodology(provenance);
  const appendix = getReportAppendix();

  const reportSpec: ReportSpec = {
    version: REPORT_SCHEMA_VERSION,
    metadata,
    executiveSummary,
    kpis,
    qualityAssessment,
    findings,
    charts,
    tables,
    statisticalAnalysis,
    methodology,
    appendix,
  };

  // Validate before returning
  return ReportSpecSchema.parse(reportSpec);
}

/**
 * End-to-end report generator: runs automated EDA on the dataset, then builds and validates the ReportSpec.
 */
export async function generateReportSpec(
  datasetPath: string,
  options?: GenerateReportOptions
): Promise<ReportSpec> {
  const edaResult = await runAutomatedEda({
    datasetPath,
    temporalDateColumn: options?.temporalDateColumn,
    temporalMetricColumn: options?.temporalMetricColumn,
    includeCorrelations: true,
  });

  return buildReportSpecFromEda(edaResult, options);
}
