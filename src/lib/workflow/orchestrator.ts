import {
  WorkflowRequest,
  WorkflowResult,
  AnalysisPlan,
} from './types.js';
import { WorkflowTracer, computeSchemaFingerprint } from '../observability/tracer.js';
import { profileDataset } from '../dataset/profiler.js';
import { defaultMetricResolver } from '../semantic/resolver.js';
import { defaultContextRetriever } from '../semantic/retrieval.js';
import { formulateAnalysisPlan } from '../dataset/plan.js';
import { validateAnalysisResult } from '../dataset/validation.js';
import { runAutomatedEda } from '../analytics/eda-engine.js';
import { generateBusinessInsights } from '../analytics/insight-generator.js';
import { isTransientError } from './error-classifier.js';
import {
  executeComputationWithRetries,
  executeArtifactGeneration,
  formatWorkflowExplanation,
} from './stage-execution.js';

export { isTransientError };

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
      // STAGE 1: Dataset & Schema Inspection
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

      // STAGE 2: Business Metric & Context Resolution
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

      // STAGE 3: Analytical Planning
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

      // STAGE 4: Analytical Execution (DuckDB or Sandboxed Python) with Bounded Retries
      checkAborted();
      options?.onProgress?.('execution', 55, 'Executing analytical query in DuckDB / Python...');
      const spanExec = tracer.startSpan(
        'execution',
        request.executionEngine === 'python' ? 'runPythonAnalysisTool' : 'executeAnalyticalQueryTool'
      );

      const stageResult = await executeComputationWithRetries(
        request,
        profile,
        resolution,
        runId,
        tracer,
        spanExec
      );

      if (!stageResult.success) {
        tracer.endSpan(spanExec, 'failed', stageResult.failureCategory || 'internal_error', {
          error: stageResult.lastExecError,
        });
        status = 'execution_error';
        errors.push(`Analytical execution failed: ${stageResult.lastExecError}`);
        finalExplanation = `Analytical execution halted due to query error: ${stageResult.lastExecError}`;
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

      executionResult = stageResult.executionResult;
      tracer.endSpan(spanExec, 'completed', 'none', {
        engineUsed: executionResult?.engineUsed,
        rowCount: executionResult?.rowCount,
      });

      // STAGE 5: Evidence & Result Validation
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

      // STAGE 6: Insight Generation
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

      // STAGE 7: Optional Artifact Generation (with Partial Failure Containment)
      checkAborted();
      options?.onProgress?.('artifact_generation', 95, 'Generating interactive dashboard and executive reports...');
      const artifactOutcome = await executeArtifactGeneration(request, runId, tracer);
      generatedArtifacts = artifactOutcome.generatedArtifacts;
      if (artifactOutcome.artifactStatus) {
        status = artifactOutcome.artifactStatus;
      }
      if (artifactOutcome.warning) {
        warnings.push(artifactOutcome.warning);
      }

      // STAGE 8: Final Response Assembly
      const spanAssemble = tracer.startSpan('response_assembly');
      finalExplanation = formatWorkflowExplanation(
        request,
        inspectionSummary,
        resolution,
        retrievedCitations,
        validation.details,
        insights
      );
      tracer.endSpan(spanAssemble, 'completed', 'none');

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
