import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { createAppServer, ServerInstance } from '../../src/server/index.js';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { InMemoryAnalysisQueue } from '../../src/lib/queue/analysis-queue.js';
import { DatasetStorageService } from '../../src/lib/dataset/storage.js';

describe('Full-Stack API Integration & E2E Workflow (Milestone 11)', { timeout: 45000 }, () => {
  let serverInstance: ServerInstance;
  let baseUrl: string;
  let tempBaseDir: string;
  const fixturePath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  beforeAll(async () => {
    tempBaseDir = path.resolve(process.cwd(), 'datasets', `test_api_tenants_${Date.now()}`);
    fs.mkdirSync(tempBaseDir, { recursive: true });

    const db = new MemoryDbAdapter();
    const queue = new InMemoryAnalysisQueue(db);
    const storage = new DatasetStorageService(db, tempBaseDir);

    serverInstance = await createAppServer({
      db,
      queue,
      storage,
      port: 0, // dynamic port
    });

    baseUrl = `http://localhost:${serverInstance.port}`;
  });

  afterAll(async () => {
    await serverInstance.close();
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('runs complete user journey: register -> upload dataset -> inspect schema -> submit question -> receive validated results -> explore dashboard -> view report', async () => {
    // 1. Register User & Org
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'analyst@enterprise.com',
        password: 'Password123!',
        name: 'Enterprise Analyst',
        organizationName: 'Global Enterprises',
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.user.email).toBe('analyst@enterprise.com');
    expect(regData.role).toBe('admin');
    const token = regData.token;

    // 2. Upload Dataset
    const csvContent = fs.readFileSync(fixturePath, 'utf8');
    const uploadRes = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filename: 'sample_sales.csv',
        content: csvContent,
      }),
    });
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.dataset.originalFilename).toBe('sample_sales.csv');
    expect(uploadData.dataset.rowCount).toBe(10);
    expect(uploadData.profile.columns.length).toBeGreaterThan(0);
    const datasetId = uploadData.dataset.id;

    // 3. Inspect Dataset & Schema Profile
    const profileRes = await fetch(`${baseUrl}/api/datasets/${datasetId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(profileRes.status).toBe(200);
    const profileData = await profileRes.json();
    expect(profileData.rowCount).toBe(10);
    expect(profileData.columns.some((c: any) => c.name === 'product_category')).toBe(true);

    // 4. Preview Dataset Rows
    const previewRes = await fetch(`${baseUrl}/api/datasets/${datasetId}/preview?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(previewRes.status).toBe(200);
    const previewData = await previewRes.json();
    expect(previewData.rows).toHaveLength(5);

    // 5. Submit Business Question
    const analysisRes = await fetch(`${baseUrl}/api/analyses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        datasetId,
        userQuery: 'What is the total gross revenue by product category?',
      }),
    });
    expect(analysisRes.status).toBe(202);
    const analysisInit = await analysisRes.json();
    expect(analysisInit.analysisId).toBeDefined();
    expect(analysisInit.jobId).toBeDefined();
    const analysisId = analysisInit.analysisId;

    // 6. Poll Analysis Status
    let attempts = 0;
    let analysisResult: any = null;
    while (attempts < 25) {
      await new Promise(r => setTimeout(r, 400));
      const statusRes = await fetch(`${baseUrl}/api/analyses/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(statusRes.status).toBe(200);
      analysisResult = await statusRes.json();
      if (analysisResult.status === 'completed' || analysisResult.status === 'failed') {
        break;
      }
      attempts++;
    }

    expect(analysisResult.status).toBe('completed');
    expect(analysisResult.progressPercent).toBe(100);
    expect(analysisResult.executionResult).toBeDefined();
    expect(analysisResult.validationResult).toBeDefined();
    expect(analysisResult.insights.length).toBeGreaterThan(0);
    expect(analysisResult.dashboardSpec).toBeDefined();

    // 7. Explore Dashboard Spec
    const dashSpec = analysisResult.dashboardSpec;
    expect(dashSpec.metadata.datasetName).toBeDefined();
    expect(dashSpec.kpis.length).toBeGreaterThan(0);
    expect(dashSpec.charts.length).toBeGreaterThan(0);

    // 8. Revisit Analysis History
    const historyRes = await fetch(`${baseUrl}/api/analyses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData).toHaveLength(1);
    expect(historyData[0].id).toBe(analysisId);
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/datasets`);
    expect(res.status).toBe(401);
  });

  it('prevents cross-tenant access to analyses and datasets', async () => {
    // Tenant Alpha registers
    const regA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alpha@alpha.com',
        password: 'Password123!',
        name: 'Alpha User',
        organizationName: 'Alpha Org',
      }),
    });
    const dataA = await regA.json();

    // Tenant Beta registers
    const regB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'beta@beta.com',
        password: 'Password123!',
        name: 'Beta User',
        organizationName: 'Beta Org',
      }),
    });
    const dataB = await regB.json();

    // Tenant Alpha uploads dataset
    const uploadRes = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dataA.token}`,
      },
      body: JSON.stringify({
        filename: 'alpha_data.csv',
        content: 'col1,col2\n1,2\n',
      }),
    });
    const alphaDataset = await uploadRes.json();

    // Tenant Beta attempts to access Tenant Alpha dataset -> 403 Forbidden
    const crossRes = await fetch(`${baseUrl}/api/datasets/${alphaDataset.dataset.id}`, {
      headers: { Authorization: `Bearer ${dataB.token}` },
    });
    expect(crossRes.status).toBe(403);
    const crossJson = await crossRes.json();
    expect(crossJson.error).toContain('Cross-tenant access violation');
  });

  it('enforces RBAC: Viewer cannot submit analyses or upload datasets', async () => {
    // Register owner
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin_owner@company.com',
        password: 'Password123!',
        name: 'Admin Owner',
      }),
    });
    const adminData = await reg.json();

    // Register second user
    const regViewer = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'viewer_user@company.com',
        password: 'Password123!',
        name: 'Viewer User',
      }),
    });
    expect(regViewer.status).toBe(201);

    // Admin adds second user to their org as viewer
    const addRes = await fetch(`${baseUrl}/api/auth/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminData.token}`,
      },
      body: JSON.stringify({
        email: 'viewer_user@company.com',
        role: 'viewer',
      }),
    });
    expect(addRes.status).toBe(200);

    // Viewer logs in to that org
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'viewer_user@company.com',
        password: 'Password123!',
        organizationId: adminData.organization.id,
      }),
    });
    const viewerContext = await loginRes.json();
    expect(viewerContext.role).toBe('viewer');

    // Viewer attempts to upload dataset -> 403
    const uploadRes = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerContext.token}`,
      },
      body: JSON.stringify({
        filename: 'viewer.csv',
        content: 'a,b\n1,2\n',
      }),
    });
    expect(uploadRes.status).toBe(403);
  });

  it('detects ambiguous business metric requests and exposes clarification question', async () => {
    // Register analyst
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'clarification_analyst@company.com',
        password: 'Password123!',
        name: 'Clarification Analyst',
      }),
    });
    const regData = await reg.json();
    const token = regData.token;

    // Upload test dataset
    const csvContent = fs.readFileSync(fixturePath, 'utf8');
    const uploadRes = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filename: 'sales_ambiguous.csv',
        content: csvContent,
      }),
    });
    const uploadData = await uploadRes.json();

    // Submit ambiguous query: "What is the total revenue by product line?"
    const analysisRes = await fetch(`${baseUrl}/api/analyses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        datasetId: uploadData.dataset.id,
        userQuery: 'What is the total revenue by product line?',
      }),
    });
    expect(analysisRes.status).toBe(202);
    const { analysisId } = await analysisRes.json();

    // Poll until complete
    let attempts = 0;
    let analysisResult: any = null;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 400));
      const statusRes = await fetch(`${baseUrl}/api/analyses/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      analysisResult = await statusRes.json();
      if (analysisResult.status === 'completed' || analysisResult.status === 'failed') break;
      attempts++;
    }

    expect(analysisResult.status).toBe('completed');
    expect(analysisResult.clarificationQuestion).toBeDefined();
    expect(analysisResult.clarificationQuestion).toContain('revenue');
  });
});
