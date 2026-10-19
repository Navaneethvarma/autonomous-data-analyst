import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { createAppServer, ServerInstance } from '../../src/server/index.js';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { InMemoryAnalysisQueue } from '../../src/lib/queue/analysis-queue.js';
import { DatasetStorageService } from '../../src/lib/dataset/storage.js';

describe('Milestone 12 API Integration: Schedules, Delivery & BI Endpoints', { timeout: 35000 }, () => {
  let serverInstance: ServerInstance;
  let baseUrl: string;
  let tempBaseDir: string;
  let adminToken: string;
  let datasetId: string;
  const fixturePath = path.resolve(process.cwd(), 'datasets', 'sample_sales.csv');

  beforeAll(async () => {
    tempBaseDir = path.resolve(process.cwd(), 'datasets', `test_m12_api_${Date.now()}`);
    fs.mkdirSync(tempBaseDir, { recursive: true });

    const db = new MemoryDbAdapter();
    const queue = new InMemoryAnalysisQueue(db);
    const storage = new DatasetStorageService(db, tempBaseDir);

    serverInstance = await createAppServer({
      db,
      queue,
      storage,
      port: 0,
      startScheduler: false, // controlled ticks in tests
    });

    baseUrl = `http://localhost:${serverInstance.port}`;

    // 1. Register Admin User
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin_m12@corp.com',
        password: 'Password123!',
        name: 'M12 Admin',
        organizationName: 'BI Analytics Corp',
      }),
    });
    const regData = await regRes.json();
    adminToken = regData.token;

    // 2. Upload dataset as Admin
    const fileBytes = fs.readFileSync(fixturePath);
    const uploadRes = await fetch(`${baseUrl}/api/datasets/upload?filename=sales.csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'text/csv',
      },
      body: fileBytes,
    });
    const uploadData = await uploadRes.json();
    datasetId = uploadData.dataset.id;

    // 3. Register a second user with Viewer role in same organization
    const orgId = regData.organization.id;
    const userViewer = await db.createUser({
      id: 'user_viewer_m12',
      email: 'viewer_m12@corp.com',
      name: 'M12 Viewer',
      passwordHash: 'dummy',
      salt: 'dummy',
    });
    await db.createMembership({
      id: 'mem_viewer_m12',
      organizationId: orgId,
      userId: userViewer.id,
      role: 'viewer',
    });
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

  it('manages delivery destinations with encrypted secret redaction in responses', async () => {
    // 1. Create delivery destination
    const createRes = await fetch(`${baseUrl}/api/delivery/destinations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Weekly Exec Slack Webhook',
        destinationType: 'webhook',
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00',
        secret: 'webhook_signing_secret_xyz',
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.destination.id).toBeDefined();
    expect(createData.destination.name).toBe('Weekly Exec Slack Webhook');
    expect(createData.destination.hasSecret).toBe(true);
    // CRITICAL: Encrypted secret must NOT be exposed in API responses
    expect(createData.destination.encryptedSecret).toBeUndefined();

    const destId = createData.destination.id;

    // 2. List delivery destinations
    const listRes = await fetch(`${baseUrl}/api/delivery/destinations`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.destinations.length).toBeGreaterThan(0);
    expect(listData.destinations[0].encryptedSecret).toBeUndefined();

    // 3. Delete delivery destination
    const delRes = await fetch(`${baseUrl}/api/delivery/destinations/${destId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);
  });

  it('manages BI connections with credential encryption and redaction', async () => {
    // 1. Create BI Connection
    const createRes = await fetch(`${baseUrl}/api/bi/connections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Corporate Superset',
        platformType: 'superset',
        hostUrl: 'https://superset.corp.internal',
        username: 'ada_bi_admin',
        password: 'super_secret_bi_password_123',
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.connection.id).toBeDefined();
    expect(createData.connection.name).toBe('Corporate Superset');
    // Password / credentials must NEVER be in response
    expect(createData.connection.encryptedCredentials).toBeUndefined();
    expect(createData.connection.password).toBeUndefined();

    const connId = createData.connection.id;

    // 2. List BI Connections
    const listRes = await fetch(`${baseUrl}/api/bi/connections`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.connections.length).toBeGreaterThan(0);
    expect(listData.connections[0].encryptedCredentials).toBeUndefined();

    // 3. Delete BI Connection
    const delRes = await fetch(`${baseUrl}/api/bi/connections/${connId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);
  });

  it('creates, edits, triggers, lists, and deletes schedules', async () => {
    // 1. Create recurring schedule
    const createRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        datasetId,
        name: 'Weekly Sales Analysis',
        userQuery: 'Summarize total sales by product category and region',
        scheduleType: 'recurring',
        cronExpression: '0 8 * * 1', // Every Monday at 8 AM
        timezone: 'America/New_York',
        concurrencyLimit: 1,
        exportFormat: 'both',
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.schedule.id).toBeDefined();
    expect(createData.schedule.name).toBe('Weekly Sales Analysis');
    expect(createData.schedule.nextRunAt).toBeDefined();
    expect(createData.schedule.status).toBe('active');

    const scheduleId = createData.schedule.id;

    // 2. Retrieve schedule detail
    const getRes = await fetch(`${baseUrl}/api/schedules/${scheduleId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.schedule.id).toBe(scheduleId);

    // 3. Edit schedule (pause schedule)
    const updateRes = await fetch(`${baseUrl}/api/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isEnabled: false,
        name: 'Paused Sales Analysis',
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.schedule.name).toBe('Paused Sales Analysis');
    expect(updateData.schedule.isEnabled).toBe(false);
    expect(updateData.schedule.status).toBe('paused');

    // 4. Trigger schedule manually
    const triggerRes = await fetch(`${baseUrl}/api/schedules/${scheduleId}/trigger`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(triggerRes.status).toBe(200);

    // 5. List schedule execution runs
    const runsRes = await fetch(`${baseUrl}/api/schedules/${scheduleId}/runs`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(runsRes.status).toBe(200);
    const runsData = await runsRes.json();
    expect(Array.isArray(runsData.runs)).toBe(true);

    // 6. Delete schedule
    const delRes = await fetch(`${baseUrl}/api/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);
  });
});
