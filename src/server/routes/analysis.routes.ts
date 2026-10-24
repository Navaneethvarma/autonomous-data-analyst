import type { RouteHandler } from '../types.js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { assertPermission, assertTenantScope } from '../../lib/auth/rbac.js';

export const handleAnalysisRoutes: RouteHandler = async (ctx) => {
  const { req, res, pathname, repositories, services, parseJsonBody, getAuthContext, sendJson } = ctx;
  const { storage, queue } = services;
  const analysisRepo = repositories.analysis;

  // =========================================================================
  // ANALYSES
  // =========================================================================
  if (pathname === '/api/analyses' && req.method === 'POST') {
    const auth = await getAuthContext();
    assertPermission(auth.role, 'analysis:create');
    const body = await parseJsonBody();

    if (!body.datasetId || !body.userQuery) {
      sendJson(400, { error: 'datasetId and userQuery are required' });
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
        (a.status === 'queued' || a.status === 'running')
    );

    if (activeDuplicate) {
      sendJson(200, {
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
      status: 'queued',
      stage: 'queued',
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
        status: 'failed',
        stage: 'failed',
        errorMessage: `Queue submission failed: ${queueErr.message}`,
        errorCategory: 'infrastructure',
      });
      sendJson(503, {
        error: 'Operational Failure: Background job queue was unable to accept this analysis. Please retry.',
        analysisId,
      });
      return true;
    }

    sendJson(202, {
      analysisId,
      jobId,
      status: 'queued',
      message: 'Analysis job submitted successfully.',
    });
    return true;
  }

  if (pathname === '/api/analyses' && req.method === 'GET') {
    const auth = await getAuthContext();
    assertPermission(auth.role, 'analysis:read');
    const analyses = await analysisRepo.listForOrganization(auth.organization.id);
    sendJson(200, analyses);
    return true;
  }

  const analysisMatch = pathname.match(/^\/api\/analyses\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
  if (analysisMatch && analysisMatch[1]) {
    const analysisId = analysisMatch[1];
    const subResource = analysisMatch[2];
    const auth = await getAuthContext();
    assertPermission(auth.role, 'analysis:read');

    const analysis = await analysisRepo.findById(analysisId, auth.organization.id);
    if (!analysis) {
      sendJson(404, { error: 'Analysis not found' });
      return true;
    }
    assertTenantScope(auth.organization.id, analysis.organizationId, 'Analysis');

    if (!subResource && req.method === 'GET') {
      sendJson(200, {
        ...analysis,
        executionResult: analysis.executionResultJson ? JSON.parse(analysis.executionResultJson) : null,
        validationResult: analysis.validationResultJson ? JSON.parse(analysis.validationResultJson) : null,
        insights: analysis.insightsJson ? JSON.parse(analysis.insightsJson) : [],
        dashboardSpec: analysis.dashboardSpecJson ? JSON.parse(analysis.dashboardSpecJson) : null,
      });
      return true;
    }

    if (subResource === 'cancel' && req.method === 'POST') {
      assertPermission(auth.role, 'analysis:cancel');
      const cancelled = await queue.cancelJob(analysis.jobId, auth.organization.id);
      sendJson(200, { success: cancelled, message: 'Analysis cancellation initiated' });
      return true;
    }
  }

  // =========================================================================
  // ARTIFACTS
  // =========================================================================
  const artifactMatch = pathname.match(/^\/api\/artifacts\/([a-zA-Z0-9_\-]+)$/);
  if (artifactMatch && artifactMatch[1] && req.method === 'GET') {
    const artifactId = artifactMatch[1];
    const auth = await getAuthContext();
    assertPermission(auth.role, 'artifact:download');

    const artifact = await analysisRepo.getArtifactById(artifactId, auth.organization.id);
    if (!artifact) {
      sendJson(404, { error: 'Artifact not found' });
      return true;
    }
    assertTenantScope(auth.organization.id, artifact.organizationId, 'Artifact');

    if (artifact.storagePath.startsWith('db://')) {
      const analysis = await analysisRepo.findById(artifact.analysisId, auth.organization.id);
      if (analysis && analysis.dashboardSpecJson) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
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
      sendJson(404, { error: 'Artifact file not found or inaccessible.' });
      return true;
    }

    const fileContent = fs.readFileSync(normalizedPath);
    res.writeHead(200, {
      'Content-Type': artifact.mimeType,
      'Content-Length': fileContent.length,
      'Content-Disposition': `inline; filename="${artifact.fileName}"`,
    });
    res.end(fileContent);
    return true;
  }

  return false;
};
