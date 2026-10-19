import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { DeliveryService } from '../../src/lib/delivery/service.js';
import { BiIntegrationService } from '../../src/lib/bi/service.js';
import { SupersetClient } from '../../src/lib/bi/superset-client.js';
import {
  BiAuthenticationError,
  BiPermissionError,
  BiRateLimitError,
} from '../../src/lib/bi/types.js';
import { encryptSecret, decryptSecret, redactSensitiveData } from '../../src/lib/security/encryption.js';
import { AuthorizationError } from '../../src/lib/auth/rbac.js';

describe('AES-256-GCM Encryption & Secret Redaction (Milestone 12)', () => {
  it('encrypts and decrypts secrets using authenticated AES-256-GCM', () => {
    const secret = 'super_secret_webhook_hmac_key_2026';
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('fails safely when decrypting tampered ciphertext', () => {
    const secret = 'valid_secret';
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(':');
    // Tamper ciphertext
    parts[2] = (parts[2] || '').slice(0, -2) + 'ff';
    const tampered = parts.join(':');

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('redacts passwords, tokens, and authorization headers in objects and strings', () => {
    const raw = {
      username: 'analyst_user',
      password: 'super_secret_password',
      apiKey: 'api_live_123456789',
      webhookUrl: 'https://webhook.internal/receiver',
      nested: {
        api_secret: 'nested_secret',
        connectionString: 'postgresql://postgres:mysecretpass@localhost:5432/db',
      },
    };

    const redacted = redactSensitiveData(raw);
    expect(redacted.username).toBe('analyst_user');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.api_secret).toBe('[REDACTED]');
    expect(redacted.nested.connectionString).toContain('postgres:***@');
  });
});

describe('Scheduled Report Delivery Subsystem (Milestone 12)', () => {
  let db: MemoryDbAdapter;
  let deliveryService: DeliveryService;
  const orgA = 'org_delivery_a';
  const orgB = 'org_delivery_b';
  const analysisId = 'analysis_delivery_test';
  const scheduleRunId = 'run_delivery_test';

  beforeEach(async () => {
    db = new MemoryDbAdapter();
    await db.init();
    deliveryService = new DeliveryService(db);

    await db.createOrganization({ id: orgA, name: 'Delivery Org A', slug: 'delivery-org-a' });
    await db.createOrganization({ id: orgB, name: 'Delivery Org B', slug: 'delivery-org-b' });

    // Seed analysis record
    await db.createAnalysis({
      id: analysisId,
      organizationId: orgA,
      userId: 'user_a',
      datasetId: 'dataset_1',
      userQuery: 'Monthly revenue trend',
      jobId: 'job_1',
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      finalExplanation: 'Revenue increased by 14% month-over-month.',
      retryCount: 0,
    });

    // Seed artifact
    await db.createArtifact({
      id: 'art_report_1',
      organizationId: orgA,
      analysisId,
      artifactType: 'report_html',
      storagePath: 'reports/report_1.html',
      fileName: 'revenue_report.html',
      mimeType: 'text/html',
      fileSizeBytes: 2048,
    });

    // Seed schedule run
    await db.createScheduleRun({
      id: scheduleRunId,
      scheduleId: 'sched_1',
      organizationId: orgA,
      analysisId,
      scheduledFor: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: 'running',
      retryCount: 0,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('delivers webhook with HMAC-SHA256 signature calculated from decrypted secret', async () => {
    const webhookSecret = 'whsec_test_secret_123';
    const encryptedSecret = encryptSecret(webhookSecret);

    const dest = await db.createDeliveryDestination({
      id: 'dest_webhook_1',
      organizationId: orgA,
      name: 'Analytics Webhook',
      destinationType: 'webhook',
      webhookUrl: 'https://example.com/api/webhook-receiver',
      encryptedSecret,
      isActive: true,
    });

    let receivedHeaders: Record<string, string> = {};
    let receivedBody = '';

    const mockFetch = (async (_url: any, init: any) => {
      receivedHeaders = init.headers;
      receivedBody = init.body;
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await deliveryService.dispatchDelivery({
      scheduleId: 'sched_1',
      scheduleRunId,
      analysisId,
      organizationId: orgA,
      destinationId: dest.id,
      fetchImpl: mockFetch,
    });

    expect(result.ok).toBe(true);
    expect(result.destinationType).toBe('webhook');

    // Verify HMAC-SHA256 signature presence and validity
    expect(receivedHeaders['X-ADA-Signature-256']).toBeDefined();
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(receivedBody).digest('hex');
    expect(receivedHeaders['X-ADA-Signature-256']).toBe(expectedSignature);

    // Verify payload contents
    const parsedPayload = JSON.parse(receivedBody);
    expect(parsedPayload.analysisId).toBe(analysisId);
    expect(parsedPayload.organizationId).toBe(orgA);
    expect(parsedPayload.artifacts.length).toBe(1);
    expect(parsedPayload.summaryExplanation).toContain('Revenue increased by 14%');

    // Verify status updated in DB
    const updatedRun = await db.getScheduleRunById(scheduleRunId, orgA);
    expect(updatedRun?.deliveryStatus).toBe('sent');
  });

  it('prevents cross-tenant delivery destination dispatch (anti-IDOR)', async () => {
    // Destination belongs to Org A
    const dest = await db.createDeliveryDestination({
      id: 'dest_org_a',
      organizationId: orgA,
      name: 'Org A Endpoint',
      destinationType: 'webhook',
      webhookUrl: 'https://org-a.com/webhook',
      isActive: true,
    });

    // Org B attempts to dispatch to Org A's destination
    await expect(
      deliveryService.dispatchDelivery({
        scheduleId: 'sched_b',
        scheduleRunId: 'run_b',
        analysisId: 'analysis_b',
        organizationId: orgB, // Org B requesting
        destinationId: dest.id,
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('rejects unsupported webhook URL protocols (e.g. file:// or ftp://)', async () => {
    const dest = await db.createDeliveryDestination({
      id: 'dest_unsafe_protocol',
      organizationId: orgA,
      name: 'Unsafe Protocol Webhook',
      destinationType: 'webhook',
      webhookUrl: 'file:///etc/passwd',
      isActive: true,
    });

    const result = await deliveryService.dispatchDelivery({
      scheduleId: 'sched_1',
      scheduleRunId,
      analysisId,
      organizationId: orgA,
      destinationId: dest.id,
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('Unsupported webhook protocol');
  });

  it('validates email recipients syntax and rejects invalid emails', async () => {
    const validDest = await db.createDeliveryDestination({
      id: 'dest_email_valid',
      organizationId: orgA,
      name: 'Executive Distribution List',
      destinationType: 'email',
      recipientEmails: 'cfo@company.com, head-of-bi@company.com',
      isActive: true,
    });

    const validResult = await deliveryService.dispatchDelivery({
      scheduleId: 'sched_1',
      scheduleRunId,
      analysisId,
      organizationId: orgA,
      destinationId: validDest.id,
    });
    expect(validResult.ok).toBe(true);
    expect(validResult.recipientSummary).toContain('cfo@company.com');

    // Invalid email test
    const invalidDest = await db.createDeliveryDestination({
      id: 'dest_email_invalid',
      organizationId: orgA,
      name: 'Bad Email List',
      destinationType: 'email',
      recipientEmails: 'not-an-email',
      isActive: true,
    });

    const invalidResult = await deliveryService.dispatchDelivery({
      scheduleId: 'sched_1',
      scheduleRunId,
      analysisId,
      organizationId: orgA,
      destinationId: invalidDest.id,
    });
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.errorMessage).toContain('Invalid recipient email format');
  });

  it('skips inactive destinations gracefully and records skipped status', async () => {
    const dest = await db.createDeliveryDestination({
      id: 'dest_inactive',
      organizationId: orgA,
      name: 'Disabled Endpoint',
      destinationType: 'email',
      recipientEmails: 'team@company.com',
      isActive: false, // Disabled
    });

    const result = await deliveryService.dispatchDelivery({
      scheduleId: 'sched_1',
      scheduleRunId,
      analysisId,
      organizationId: orgA,
      destinationId: dest.id,
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('inactive/disabled');

    const updatedRun = await db.getScheduleRunById(scheduleRunId, orgA);
    expect(updatedRun?.deliveryStatus).toBe('skipped');
  });
});

describe('Apache Superset BI Integration (Milestone 12)', () => {
  const supersetHost = 'https://superset.analytics.internal';
  const credentials = {
    username: 'ada_service_user',
    password: 'secure_password_123',
  };

  it('authenticates via JWT and tests connection successfully', async () => {
    const mockFetch = (async (url: any, _init: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/security/login')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock_jwt_access_token_12345',
            refresh_token: 'mock_jwt_refresh_token_67890',
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/api/v1/dataset')) {
        return new Response(JSON.stringify({ result: [{ id: 1, table_name: 'test' }] }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const client = new SupersetClient(supersetHost, credentials, mockFetch);
    const testResult = await client.testConnection();

    expect(testResult.ok).toBe(true);
    expect(testResult.message).toContain('Successfully connected');
    expect(client.getRefreshToken()).toBe('mock_jwt_refresh_token_67890');
  });

  it('discovers authorized datasets from Superset', async () => {
    const mockDatasets = [
      { id: 101, table_name: 'sales_performance', schema: 'public', database: { database_name: 'prod_warehouse' } },
      { id: 102, table_name: 'marketing_attribution', schema: 'analytics', database: { database_name: 'prod_warehouse' } },
    ];

    const mockFetch = (async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/security/login')) {
        return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      }
      if (urlStr.includes('/api/v1/dataset')) {
        return new Response(JSON.stringify({ result: mockDatasets }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const client = new SupersetClient(supersetHost, credentials, mockFetch);
    const datasets = await client.listDatasets();

    expect(datasets.length).toBe(2);
    expect(datasets[0]!.tableName).toBe('sales_performance');
    expect(datasets[0]!.databaseName).toBe('prod_warehouse');
  });

  it('publishes charts to Superset with chart specification', async () => {
    let publishedBody: any = null;

    const mockFetch = (async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/security/login')) {
        return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      }
      if (urlStr.includes('/api/v1/chart')) {
        publishedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: 42 }), { status: 201 });
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const client = new SupersetClient(supersetHost, credentials, mockFetch);
    const chart = await client.publishChart({
      sliceName: 'Revenue Trend by Month',
      vizType: 'echarts_timeseries_line',
      datasourceId: 101,
      params: { metrics: ['total_revenue'], groupby: ['order_date'] },
      description: 'Autonomous Data Analyst Generated Chart',
    });

    expect(chart.id).toBe(42);
    expect(chart.sliceName).toBe('Revenue Trend by Month');
    expect(chart.url).toContain('/explore/?slice_id=42');
    expect(publishedBody.slice_name).toBe('Revenue Trend by Month');
    expect(publishedBody.viz_type).toBe('echarts_timeseries_line');
  });

  it('maps Superset HTTP errors to typed error hierarchy', async () => {
    // 401 Unauthorized
    const mockAuthFail = (async () => new Response('Invalid credentials', { status: 401 })) as unknown as typeof fetch;
    const clientAuth = new SupersetClient(supersetHost, credentials, mockAuthFail);
    await expect(clientAuth.authenticate()).rejects.toThrow(BiAuthenticationError);

    // 403 Forbidden
    const mockForbidden = (async (url: any) => {
      if (url.toString().includes('/login')) return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      return new Response('Forbidden', { status: 403 });
    }) as unknown as typeof fetch;
    const clientForbidden = new SupersetClient(supersetHost, credentials, mockForbidden);
    await expect(clientForbidden.listDatasets()).rejects.toThrow(BiPermissionError);

    // 429 Rate Limit with Retry-After header
    const mockRateLimit = (async (url: any) => {
      if (url.toString().includes('/login')) return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '30' },
      });
    }) as unknown as typeof fetch;
    const clientRate = new SupersetClient(supersetHost, credentials, mockRateLimit);
    await expect(clientRate.listDatasets()).rejects.toThrow(BiRateLimitError);
  });

  it('rotates connection credentials securely via BiIntegrationService', async () => {
    const db = new MemoryDbAdapter();
    await db.init();
    const biService = new BiIntegrationService(db);
    const orgId = 'org_bi_test';

    const conn = await db.createBiConnection({
      id: 'conn_rotate_test',
      organizationId: orgId,
      name: 'Superset Prod',
      platformType: 'superset',
      hostUrl: supersetHost,
      encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
      status: 'connected',
    });

    const newCreds = { username: 'ada_rotated_user', password: 'new_super_secret_password' };
    await biService.rotateCredentials(conn.id, orgId, newCreds);

    const updatedConn = await db.getBiConnectionById(conn.id, orgId);
    expect(updatedConn?.status).toBe('untested');

    const decrypted = JSON.parse(decryptSecret(updatedConn!.encryptedCredentials));
    expect(decrypted.username).toBe('ada_rotated_user');
    expect(decrypted.password).toBe('new_super_secret_password');

    await db.close();
  });
});
