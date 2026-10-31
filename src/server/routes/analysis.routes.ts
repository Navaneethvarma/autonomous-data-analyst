import { type RouteHandler, HttpMethod, HttpStatus, ApiRoute } from '../types.js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Permission, assertPermission, assertTenantScope } from '../../lib/auth/rbac.js';
import { AnalysisJobStatus, AnalysisAction } from '../../types/analysis.types.js';

const ANALYSIS_DETAIL_PATTERN = new RegExp(`^${ApiRoute.ANALYSES}/([a-zA-Z0-9_\\-]+)(?:/([a-zA-Z0-9_\\-]+))?$`);
const ARTIFACT_DETAIL_PATTERN = new RegExp(`^${ApiRoute.ARTIFACTS}/([a-zA-Z0-9_\\-]+)$`);

export const handleAnalysisRoutes: RouteHandler = async (ctx) => {
  const { req, res, pathname, repositories, services, parseJsonBody, getAuthContext, sendJson } = ctx;
  const { storage, queue } = services;
  const analysisRepo = repositories.analysis;

  // =========================================================================
  // ANALYSES
  // =========================================================================
  if (pathname === ApiRoute.ANALYSES && req.method === HttpMethod.POST) {
    const auth = await getAuthContext();
    assertPermission(auth.role, Permission.ANALYSIS_CREATE);
    const body = await parseJsonBody();

    if (!body.datasetId || !body.userQuery) {
      sendJson(HttpStatus.BAD_REQUEST, { error: 'datasetId and userQuery are required' });
      return true;
    }

    // Verify dataset belongs to tenant
    const dataset = await storage.getDataset(auth, body.datasetId);

    // Idempotency: Check if an active analysis with the same query and dataset is currently queued or running
    const existingAnalyses = await analysisRepo.listForOrganization(auth.organization.id);
    const activeDuplicate = existingAnalyses.find(
      a =>
        a.datasetId === dataset.id &&
        a.userQuery.trim().toLowerCase() === body.userQuery.trim().toLowerCase() &&
        (a.status === AnalysisJobStatus.QUEUED || a.status === AnalysisJobStatus.RUNNING)
    );

    if (activeDuplicate) {
      sendJson(HttpStatus.OK, {
        analysisId: activeDuplicate.id,
        jobId: activeDuplicate.jobId,
        status: activeDuplicate.status,
        message: 'An identical analysis is already in progress.',
        isDuplicate: true,
      });
      return true;
    }

    const analysisId = crypto.randomUUID();
    await analysisRepo.create({
      id: analysisId,
      organizationId: auth.organization.id,
      userId: auth.user.id,
      datasetId: dataset.id,
      userQuery: body.userQuery.trim(),
      jobId: 'pending',
      status: AnalysisJobStatus.QUEUED,
      stage: AnalysisJobStatus.QUEUED,
      progressPercent: 0,
      retryCount: 0,
    });

    let jobId: string;
    try {
      const submission = await queue.submitJob({
        analysisId,
        organizationId: auth.organization.id,
        userId: auth.user.id,
        datasetId: dataset.id,
        datasetPath: dataset.storagePath,
        userQuery: body.userQuery.trim(),
      });
      jobId = submission.jobId;
    } catch (queueErr: any) {
      await analysisRepo.update(analysisId, {
        status: AnalysisJobStatus.FAILED,
        stage: AnalysisJobStatus.FAILED,
        errorMessage: `Queue submission failed: ${queueErr.message}`,
        errorCategory: 'infrastructure',
      });
      sendJson(HttpStatus.SERVICE_UNAVAILABLE, {
        error: 'Operational Failure: Background job queue was unable to accept this analysis. Please retry.',
        analysisId,
      });
      return true;
    }

    sendJson(HttpStatus.ACCEPTED, {
      analysisId,
      jobId,
      status: AnalysisJobStatus.QUEUED,
      message: 'Analysis job submitted successfully.',
    });
    return true;
  }

  if (pathname === ApiRoute.ANALYSES && req.method === HttpMethod.GET) {
    const auth = await getAuthContext();
    assertPermission(auth.role, Permission.ANALYSIS_READ);
    const analyses = await analysisRepo.listForOrganization(auth.organization.id);
    sendJson(HttpStatus.OK, analyses);
    return true;
  }

  const analysisMatch = pathname.match(ANALYSIS_DETAIL_PATTERN);
  if (analysisMatch && analysisMatch[1]) {
    const analysisId = analysisMatch[1];
    const subResource = analysisMatch[2];
    const auth = await getAuthContext();
    assertPermission(auth.role, Permission.ANALYSIS_READ);

    const analysis = await analysisRepo.findById(analysisId, auth.organization.id);
    if (!analysis) {
      sendJson(HttpStatus.NOT_FOUND, { error: 'Analysis not found' });
      return true;
    }
    assertTenantScope(auth.organization.id, analysis.organizationId, 'Analysis');

    if (!subResource && req.method === HttpMethod.GET) {
      sendJson(HttpStatus.OK, {
        ...analysis,
        executionResult: analysis.executionResultJson ? JSON.parse(analysis.executionResultJson) : null,
        validationResult: analysis.validationResultJson ? JSON.parse(analysis.validationResultJson) : null,
        insights: analysis.insightsJson ? JSON.parse(analysis.insightsJson) : [],
        dashboardSpec: analysis.dashboardSpecJson ? JSON.parse(analysis.dashboardSpecJson) : null,
      });
      return true;
    }

    if (subResource === AnalysisAction.CANCEL && req.method === HttpMethod.POST) {
      assertPermission(auth.role, Permission.ANALYSIS_CANCEL);
      const cancelled = await queue.cancelJob(analysis.jobId, auth.organization.id);
      sendJson(HttpStatus.OK, { success: cancelled, message: 'Analysis cancellation initiated' });
      return true;
    }
  }

  // =========================================================================
  // ARTIFACTS
  // =========================================================================
  const artifactMatch = pathname.match(ARTIFACT_DETAIL_PATTERN);
  if (artifactMatch && artifactMatch[1] && req.method === HttpMethod.GET) {
    const artifactId = artifactMatch[1];
    const auth = await getAuthContext();
    assertPermission(auth.role, Permission.ARTIFACT_DOWNLOAD);

    const artifact = await analysisRepo.getArtifactById(artifactId, auth.organization.id);
    if (!artifact) {
      sendJson(HttpStatus.NOT_FOUND, { error: 'Artifact not found' });
      return true;
    }
    assertTenantScope(auth.organization.id, artifact.organizationId, 'Artifact');

    if (artifact.storagePath.startsWith('db://')) {
      const analysis = await analysisRepo.findById(artifact.analysisId, auth.organization.id);
      if (analysis && analysis.dashboardSpecJson) {
        res.writeHead(HttpStatus.OK, { 'Content-Type': 'application/json' });
        res.end(analysis.dashboardSpecJson);
        return true;
      }
    }

    const normalizedPath = path.resolve(artifact.storagePath);
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const datasetsDir = path.resolve(process.cwd(), 'datasets');

    const isAuthorizedLocation =
      normalizedPath.startsWith(reportsDir) || normalizedPath.startsWith(datasetsDir);

    if (!isAuthorizedLocation || !fs.existsSync(normalizedPath)) {
      sendJson(HttpStatus.NOT_FOUND, { error: 'Artifact file not found or inaccessible.' });
      return true;
    }

    const fileContent = fs.readFileSync(normalizedPath);
    res.writeHead(HttpStatus.OK, {
      'Content-Type': artifact.mimeType,
      'Content-Length': fileContent.length,
      'Content-Disposition': `inline; filename="${artifact.fileName}"`,
    });
    res.end(fileContent);
    return true;
  }

  return false;
};
