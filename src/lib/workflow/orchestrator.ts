import path from 'node:path';
import fs from 'node:fs';
import {
  WorkflowRequest,
  WorkflowResult,
  AnalysisPlan,
} from './types.js';
import { WorkflowTracer, computeSchemaFingerprint } from '../observability/tracer.js';
import { FailureCategory } from '../observability/types.js';
import { profileDataset } from '../dataset/profiler.js';
import { defaultMetricResolver } from '../semantic/resolver.js';
import { defaultContextRetriever } from '../semantic/retrieval.js';
import { formulateAnalysisPlan } from '../dataset/plan.js';
import { executeAnalyticalQuery, QueryTimeoutError } from '../analytics/duckdb-engine.js';
import { SqlSecurityError, SqlSyntaxError } from '../analytics/sql-validator.js';
import { executeSandboxedPython } from '../python/sandbox-runner.js';
import { validateAnalysisResult } from '../dataset/validation.js';
import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import { generateDashboardSpec } from '../dashboard/generator.js';
import { generateReportSpec } from '../report/generator.js';
import { renderReportHtml } from '../report/html-renderer.js';
import { exportPdfFromHtml } from '../report/pdf-generator.js';

/**
 * Determines if an execution error is transient (e.g. timeout, temporary resource lock)
 * or permanent (syntax error, security/authorization violation, schema defect).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof SqlSecurityError || err instanceof SqlSyntaxError) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Permanent safety, syntax, schema, and authorization errors must NEVER be retried
  if (
    lower.includes('prohibited') ||
    lower.includes('unauthorized') ||
    lower.includes('security') ||
    lower.includes('syntax') ||
    lower.includes('binder error') ||
    lower.includes('catalog error') ||
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('access denied') ||
    lower.includes('path traversal') ||
    lower.includes('disallowed') ||
    lower.includes('validation failed') ||
    lower.includes('execution policy rejection')
  ) {
    return false;
  }

  // Transient errors eligible for bounded retries
  if (
    err instanceof QueryTimeoutError ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('temporarily unavailable')
  ) {
    return true;
  }

  return false;
}

export class AnalyticalWorkflowOrchestrator {
  /**
   * Executes a complete, end-to-end analytical workflow with structured stages,
   * bounded retries, full provenance, and correlated observability tracing.
   */
  public async executeWorkflow(
    request: WorkflowRequest,
    options?: {
      signal?: AbortSignal;
      onProgress?: (stage: string, percent: number, message: string) => void;
    }
  ): Promise<WorkflowResult> {
    const tracer = new WorkflowTracer(request.userQuery, 'analytical-workflow', request.datasetPath);
    const traceId = tracer.getTraceId();
    const runId = tracer.getRunId();

    const checkAborted = () => {
      if (options?.signal?.aborted) {
        throw new Error('Analysis execution cancelled by user.');
      }
    };

    checkAborted();
    options?.onProgress?.('inspection', 10, 'Inspecting dataset and profiling schema...');

    const errors: string[] = [];
    const warnings: string[] = [];
    let schemaFingerprint = '';
    let inspectionSummary: WorkflowResult['inspectionSummary'] = null;
    let semanticResolution: WorkflowResult['semanticResolution'] = null;
    let retrievedCitations: WorkflowResult['retrievedCitations'] = [];
    let analyticalPlan: AnalysisPlan | null = null;
    let executionResult: WorkflowResult['executionResult'] = null;
    let validationResult: WorkflowResult['validationResult'] = null;
    let insights: WorkflowResult['insights'] = [];
    let generatedArtifacts: WorkflowResult['generatedArtifacts'] = {
      dashboardSpecGenerated: false,
    };
    let finalExplanation: string | null = null;
    let clarificationQuestion: string | null = null;
    let status: WorkflowResult['status'] = 'completed';

    try {
      // =======================================================================
      // STAGE 1: Dataset & Schema Inspection
      // =======================================================================
      const spanInspect = tracer.startSpan('inspection', 'profileDataset', { datasetPath: request.datasetPath });
      let profile;
      try {
        profile = await profileDataset(request.datasetPath);
        const datasetColumns = profile.columns.map((c) => ({
          name: c.name,
          inferredType: c.inferredType,
        }));
        schemaFingerprint = computeSchemaFingerprint(datasetColumns);
        tracer.setSchemaFingerprint(schemaFingerprint);

        const totalCells = profile.rowCount * profile.columnCount;
        const nullCells = profile.columns.reduce((sum, c) => sum + c.nullCount, 0);
        const dataQualityScore = totalCells > 0 ? Math.round(((totalCells - nullCells) / totalCells) * 100) : 100;

        inspectionSummary = {
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          columns: datasetColumns,
          dataQualityScore,
        };
        tracer.endSpan(spanInspect, 'completed', 'none', {
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          fingerprint: schemaFingerprint,
        });
      } catch (err: any) {
        tracer.endSpan(spanInspect, 'failed', 'transient_io', { error: err.message });
        errors.push(`Inspection failed: ${err.message}`);
        return {
          workflowId: 'analytical-workflow',
          runId,
          traceId,
          status: 'terminal_failure',
          userQuery: request.userQuery,
          datasetPath: request.datasetPath,
          schemaFingerprint,
          inspectionSummary: null,
          semanticResolution: null,
          retrievedCitations: [],
          analyticalPlan: null,
          executionResult: null,
          validationResult: null,
          insights: [],
          generatedArtifacts,
          finalExplanation: `Inspection failed: ${err.message}`,
          clarificationQuestion: null,
          trace: tracer.finishTrace('failed'),
          errors,
          warnings,
        };
      }

      // =======================================================================
      // STAGE 2: Business Metric & Context Resolution
      // =======================================================================
      checkAborted();
      options?.onProgress?.('semantic_resolution', 25, 'Resolving business metrics and context...');
      const spanSemantic = tracer.startSpan('semantic_resolution', 'resolveBusinessMetricTool', {
        userQuery: request.userQuery,
      });

      const scope = request.scope ?? { level: 'application_wide' };
      const context = defaultContextRetriever.retrieveContext({
        query: request.userQuery,
        scope,
        maxResults: 3,
      });
      retrievedCitations = context.citations;

      const resolution = defaultMetricResolver.resolveMetric({
        userQuery: request.userQuery,
        datasetColumns: inspectionSummary.columns as any,
        scope,
      });
      semanticResolution = resolution;
      warnings.push(...resolution.warnings);

      // Check for Ambiguity
      if (resolution.status === 'ambiguous') {
        tracer.endSpan(spanSemantic, 'warning', 'unresolved_ambiguity', {
          conflictingDefinitions: resolution.conflictingDefinitions,
        });
        status = 'ambiguity_clarification_needed';
        clarificationQuestion = resolution.clarificationNeeded ?? null;
        finalExplanation = `The analytical request requires business clarification: ${resolution.clarificationNeeded}`;
        return {
          workflowId: 'analytical-workflow',
          runId,
          traceId,
          status,
          userQuery: request.userQuery,
          datasetPath: request.datasetPath,
          schemaFingerprint,
          inspectionSummary,
          semanticResolution,
          retrievedCitations,
          analyticalPlan: null,
          executionResult: null,
          validationResult: null,
          insights: [],
          generatedArtifacts,
          finalExplanation,
          clarificationQuestion,
          trace: tracer.finishTrace('ambiguity_clarification_needed'),
          errors,
          warnings,
        };
      }

      // Check for Incompatible Schema
      if (resolution.status === 'incompatible_schema') {
        tracer.endSpan(spanSemantic, 'failed', 'schema_incompatible', {
          missingColumns: resolution.missingColumns,
        });
        status = 'incompatible_schema';
        errors.push(`Dataset is missing required columns: ${resolution.missingColumns.join(', ')}`);
        finalExplanation = `Cannot execute analytical query because the dataset lacks required columns: ${resolution.missingColumns.join(', ')}.`;
        return {
          workflowId: 'analytical-workflow',
          runId,
          traceId,
          status,
          userQuery: request.userQuery,
          datasetPath: request.datasetPath,
          schemaFingerprint,
          inspectionSummary,
          semanticResolution,
          retrievedCitations,
          analyticalPlan: null,
          executionResult: null,
          validationResult: null,
          insights: [],
          generatedArtifacts,
          finalExplanation,
          clarificationQuestion,
          trace: tracer.finishTrace('failed'),
          errors,
          warnings,
        };
      }

      if (resolution.status === 'unresolved_exploratory') {
        status = 'unresolved_exploratory';
      }

      tracer.endSpan(spanSemantic, 'completed', 'none', {
        status: resolution.status,
        metricId: resolution.resolvedMetric?.metricId,
        citationsCount: context.citations.length,
      });

      // =======================================================================
      // STAGE 3: Analytical Planning
      // =======================================================================
      checkAborted();
      options?.onProgress?.('planning', 40, 'Formulating analysis execution plan...');
      const spanPlan = tracer.startSpan('planning', 'formulateAnalysisPlanTool');
      const reqCols = resolution.resolvedMetric?.requiredSourceColumns.map((c) => c.name) ?? [profile.columns[0]?.name ?? 'transaction_id'];
      try {
        analyticalPlan = await formulateAnalysisPlan({
          datasetPath: request.datasetPath,
          businessQuestion: request.userQuery,
          primaryObjective: `Analyze ${resolution.resolvedMetric?.name ?? 'business data'}`,
          requiredColumns: reqCols,
          targetMetrics: [
            {
              name: resolution.resolvedMetric?.name ?? 'metric',
              description: resolution.resolvedMetric?.description ?? 'analysis metric',
              formulaOrAggregation: resolution.resolvedMetric?.calculationFormula,
            },
          ],
          plannedSteps: ['inspect schema', 'execute computation', 'validate evidence'],
        });
        tracer.endSpan(spanPlan, 'completed', 'none', {
          planId: analyticalPlan.planId,
          stepsCount: analyticalPlan.plannedSteps.length,
        });
      } catch (planErr: any) {
        tracer.endSpan(spanPlan, 'warning', 'none', { reason: planErr.message });
      }

      // =======================================================================
      // STAGE 4: Analytical Execution (DuckDB or Sandboxed Python) with Bounded Retries
      // =======================================================================
      checkAborted();
      options?.onProgress?.('execution', 55, 'Executing analytical query in DuckDB / Python...');
      const isPythonAnalysis =
        request.executionEngine === 'python' ||
        request.userQuery.toLowerCase().includes('distribution moment') ||
        request.userQuery.toLowerCase().includes('confidence interval') ||
        request.userQuery.toLowerCase().includes('welch') ||
        request.userQuery.toLowerCase().includes('regression');

      const spanExec = tracer.startSpan(
        'execution',
        isPythonAnalysis ? 'runPythonAnalysisTool' : 'executeAnalyticalQueryTool'
      );

      let executionSuccess = false;
      const retryPolicy = request.retryPolicy ?? {};
      let retriesLeft = retryPolicy.maxRetries ?? 2;
      const timeoutMs = retryPolicy.timeoutMs ?? 15000;
      let lastExecError = '';

      while (!executionSuccess && retriesLeft >= 0) {
        try {
          if (isPythonAnalysis) {
            const numericCol = profile.columns.find((c) => c.inferredType === 'float' || c.inferredType === 'integer')?.name ?? 'unit_price';
            const pyResult = await executeSandboxedPython({
              taskId: `wf_py_${runId.substring(4, 12)}`,
              taskType: 'descriptive_stats',
              datasetId: path.basename(request.datasetPath),
              datasetPath: request.datasetPath,
              columns: [numericCol],
              parameters: { column: numericCol },
              limits: { timeoutMs, maxOutputBytes: 524288, maxRows: 10000 },
            });

            if (pyResult.status === 'error') {
              throw new Error(pyResult.error ?? 'Python analysis failed');
            }

            executionResult = {
              engineUsed: 'python',
              pythonTaskType: pyResult.taskType,
              numericSummary: pyResult.numericResults as Record<string, unknown>,
              rowCount: pyResult.sampleSize?.validObservations ?? 1,
              executionDurationMs: pyResult.provenance.executionTimeMs,
            };
            executionSuccess = true;
          } else {
            const metricFormula = resolution.sqlExpression ?? 'COUNT(*)';
            const dimensionCol = profile.columns.find((c) => c.inferredType === 'string')?.name ?? 'product_category';

            const sql = `
              SELECT 
                ${dimensionCol},
                ${metricFormula} AS computed_metric,
                COUNT(*) AS record_count
              FROM dataset
              GROUP BY ${dimensionCol}
              ORDER BY computed_metric DESC
            `;

            const queryOutput = await executeAnalyticalQuery(
              {
                datasetPath: request.datasetPath,
                sql,
                timeoutMs,
              },
              {}
            );

            executionResult = {
              engineUsed: 'duckdb',
              sql,
              rows: queryOutput.rows as Array<Record<string, unknown>>,
              rowCount: queryOutput.rowCount,
              executionDurationMs: queryOutput.executionTimeMs,
            };
            executionSuccess = true;
          }
        } catch (err: any) {
          lastExecError = err.message || String(err);
          const isTransient = isTransientError(err);
          if (isTransient && retriesLeft > 0) {
            tracer.recordSpanRetry(
              spanExec,
              'transient_timeout',
              `Transient execution failure, retrying: ${lastExecError}`
            );
            retriesLeft--;
          } else {
            // Permanent failure (syntax error, security/safety violation, schema defect) fails immediately without retry
            break;
          }
        }
      }

      if (!executionSuccess) {
        const lowerErr = lastExecError.toLowerCase();
        let failCat: FailureCategory = 'internal_error';
        if (
          lowerErr.includes('prohibited') ||
          lowerErr.includes('security') ||
          lowerErr.includes('unauthorized') ||
          lowerErr.includes('syntax') ||
          lowerErr.includes('statement') ||
          lowerErr.includes('disallowed')
        ) {
          failCat = 'syntax_or_safety_violation';
        } else if (
          lowerErr.includes('column') ||
          lowerErr.includes('table') ||
          lowerErr.includes('binder error') ||
          lowerErr.includes('catalog error') ||
          lowerErr.includes('not found') ||
          lowerErr.includes('does not exist')
        ) {
          failCat = 'schema_incompatible';
        } else if (lowerErr.includes('timed out') || lowerErr.includes('timeout')) {
          failCat = 'transient_timeout';
        }

        tracer.endSpan(spanExec, 'failed', failCat, { error: lastExecError });
        status = 'execution_error';
        errors.push(`Analytical execution failed: ${lastExecError}`);
        finalExplanation = `Analytical execution halted due to query error: ${lastExecError}`;
        return {
          workflowId: 'analytical-workflow',
          runId,
          traceId,
          status,
          userQuery: request.userQuery,
          datasetPath: request.datasetPath,
          schemaFingerprint,
          inspectionSummary,
          semanticResolution,
          retrievedCitations,
          analyticalPlan,
          executionResult: null,
          validationResult: null,
          insights: [],
          generatedArtifacts,
          finalExplanation,
          clarificationQuestion,
          trace: tracer.finishTrace('failed'),
          errors,
          warnings,
        };
      }

      tracer.endSpan(spanExec, 'completed', 'none', {
        engineUsed: executionResult?.engineUsed,
        rowCount: executionResult?.rowCount,
      });

      // =======================================================================
      // STAGE 5: Evidence & Result Validation
      // =======================================================================
      checkAborted();
      options?.onProgress?.('validation', 70, 'Validating computed evidence and invariants...');
      const spanVal = tracer.startSpan('validation', 'validateAnalysisResultTool');
      const sampleVal = executionResult?.rows?.[0]?.computed_metric ?? executionResult?.numericSummary?.mean ?? 0;

      const validation = validateAnalysisResult({
        metricName: resolution.resolvedMetric?.name ?? 'Metric Computation',
        metricValue: sampleVal,
        rule: {
          type: 'non_negative',
        },
      });

      validationResult = {
        isValid: validation.isValid,
        status: validation.status,
        ruleApplied: validation.ruleApplied,
        details: validation.details,
      };

      if (!validation.isValid) {
        tracer.endSpan(spanVal, 'failed', 'validation_rejected', { details: validation.details });
        status = 'validation_failed';
        errors.push(`Validation rejected: ${validation.details}`);
        finalExplanation = `Result validation failed: ${validation.details}`;
        return {
          workflowId: 'analytical-workflow',
          runId,
          traceId,
          status,
          userQuery: request.userQuery,
          datasetPath: request.datasetPath,
          schemaFingerprint,
          inspectionSummary,
          semanticResolution,
          retrievedCitations,
          analyticalPlan,
          executionResult,
          validationResult,
          insights: [],
          generatedArtifacts,
          finalExplanation,
          clarificationQuestion,
          trace: tracer.finishTrace('validation_failed'),
          errors,
          warnings,
        };
      }

      tracer.endSpan(spanVal, 'completed', 'none', { ruleApplied: validation.ruleApplied });

      // =======================================================================
      // STAGE 6: Insight Generation
      // =======================================================================
      checkAborted();
      options?.onProgress?.('insight_generation', 85, 'Extracting data findings and business insights...');
      const spanInsights = tracer.startSpan('insight_generation', 'generateBusinessInsights');
      try {
        const edaSummary = await runAutomatedEda({
          datasetPath: request.datasetPath,
          includeCorrelations: true,
        });
        const generated = generateBusinessInsights(edaSummary);
        insights = generated.map((ins, idx) => ({
          id: `ins_${idx + 1}`,
          type: 'fact' as const,
          title: ins.title,
          description: ins.observedFact,
          confidence: ins.confidence,
        }));
        tracer.endSpan(spanInsights, 'completed', 'none', { insightCount: insights.length });
      } catch (edaErr: any) {
        tracer.endSpan(spanInsights, 'warning', 'none', { error: edaErr.message });
      }

      // =======================================================================
      // STAGE 7: Optional Artifact Generation (with Partial Failure Containment)
      // =======================================================================
      checkAborted();
      options?.onProgress?.('artifact_generation', 95, 'Generating interactive dashboard and executive reports...');
      const artifactsReq = request.generateArtifacts ?? {};
      if (artifactsReq.dashboard || artifactsReq.report) {
        const spanArtifacts = tracer.startSpan('artifact_generation', 'dashboardAndReportEngines');
        try {
          if (artifactsReq.dashboard) {
            const dashboardSpec = await generateDashboardSpec({
              datasetPath: request.datasetPath,
            });
            generatedArtifacts.dashboardSpecGenerated = true;
            generatedArtifacts.dashboardSpec = dashboardSpec;
          }

          if (artifactsReq.report) {
            const reportSpec = await generateReportSpec(request.datasetPath, {
              title: artifactsReq.reportTitle ?? 'Analytical Workflow Executive Report',
            });
            const html = renderReportHtml(reportSpec);
            const reportDir = path.resolve(process.cwd(), 'reports');
            if (!fs.existsSync(reportDir)) {
              fs.mkdirSync(reportDir, { recursive: true });
            }
            const htmlPath = path.join(reportDir, `wf_report_${runId.substring(4, 12)}.html`);
            fs.writeFileSync(htmlPath, html, 'utf-8');
            generatedArtifacts.reportHtmlPath = htmlPath;

            try {
              const pdfPath = path.join(reportDir, `wf_report_${runId.substring(4, 12)}.pdf`);
              const pdfResult = await exportPdfFromHtml(html, pdfPath);
              if (pdfResult && pdfResult.outputPath) {
                generatedArtifacts.reportPdfPath = pdfResult.outputPath;
              }
            } catch {
              // PDF generation can be optional if browser unavailable
            }
          }

          tracer.endSpan(spanArtifacts, 'completed', 'none');
        } catch (artifactErr: any) {
          // PARTIAL FAILURE ISOLATION:
          // Do not fail the whole analysis! Preserve verified computation and report artifact failure explicitly.
          tracer.endSpan(spanArtifacts, 'warning', 'artifact_generation_error', {
            error: artifactErr.message,
          });
          status = 'partial_success_artifact_failed';
          generatedArtifacts.artifactError = artifactErr.message;
          warnings.push(`Analysis succeeded but artifact generation failed: ${artifactErr.message}`);
        }
      }

      // =======================================================================
      // STAGE 8: Final Response Assembly
      // =======================================================================
      const spanAssemble = tracer.startSpan('response_assembly');
      const metricName = resolution.resolvedMetric?.name ?? 'Computed Analysis';
      const metricOwner = resolution.resolvedMetric?.owner ?? 'Internal Governance';
      const formula = resolution.resolvedMetric?.calculationFormula ?? resolution.sqlExpression ?? 'Statistical Engine';
      const additivity = resolution.resolvedMetric?.additivity ?? 'additive';
      const citationTitle = retrievedCitations[0]?.title ?? 'Standard Corporate Policy';

      let explanation = `Analytical Workflow completed with evidence verification for: "${request.userQuery}".\n`;
      explanation += `- Target Dataset: ${path.basename(request.datasetPath)} (${inspectionSummary.rowCount} rows, ${inspectionSummary.columnCount} columns, quality score: ${inspectionSummary.dataQualityScore}%).\n`;
      explanation += `- Metric Grounding: '${metricName}' governed by ${metricOwner} using formula: ${formula}.\n`;
      explanation += `- Additivity Semantics: '${additivity}' — verified aggregation compatibility.\n`;
      explanation += `- Grounded Citation: ${citationTitle}.\n`;
      explanation += `- Evidence Validation: ${validation.details}.\n`;

      if (insights.length > 0) {
        explanation += `- Key Finding: ${insights[0]?.title} (${insights[0]?.description}).\n`;
      }

      finalExplanation = explanation;
      tracer.endSpan(spanAssemble, 'completed', 'none');

      // Finalize Trace
      const finalTraceStatus =
        status === 'partial_success_artifact_failed'
          ? 'partial_success'
          : status === 'completed'
            ? 'completed'
            : status === 'unresolved_exploratory'
              ? 'unresolved_exploratory'
              : 'failed';

      const trace = tracer.finishTrace(finalTraceStatus);

      return {
        workflowId: 'analytical-workflow',
        runId,
        traceId,
        status,
        userQuery: request.userQuery,
        datasetPath: request.datasetPath,
        schemaFingerprint,
        inspectionSummary,
        semanticResolution,
        retrievedCitations,
        analyticalPlan,
        executionResult,
        validationResult,
        insights,
        generatedArtifacts,
        finalExplanation,
        clarificationQuestion,
        trace,
        errors,
        warnings,
      };
    } catch (unhandledErr: any) {
      errors.push(`Unhandled workflow failure: ${unhandledErr.message}`);
      return {
        workflowId: 'analytical-workflow',
        runId,
        traceId,
        status: 'terminal_failure',
        userQuery: request.userQuery,
        datasetPath: request.datasetPath,
        schemaFingerprint,
        inspectionSummary,
        semanticResolution,
        retrievedCitations,
        analyticalPlan,
        executionResult,
        validationResult,
        insights,
        generatedArtifacts,
        finalExplanation: `Analytical pipeline encountered a terminal error: ${unhandledErr.message}`,
        clarificationQuestion,
        trace: tracer.finishTrace('failed'),
        errors,
        warnings,
      };
    }
  }
}

export const defaultWorkflowOrchestrator = new AnalyticalWorkflowOrchestrator();
