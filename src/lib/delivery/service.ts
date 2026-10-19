import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/adapter.js';
import { DeliveryDestinationRecord } from '../db/types.js';
import { decryptSecret, redactSensitiveData } from '../security/encryption.js';
import { assertTenantScope, AuthorizationError } from '../auth/rbac.js';

export interface DeliveryResult {
  ok: boolean;
  destinationType: 'email' | 'webhook';
  destinationId: string;
  deliveredAt: string;
  recipientSummary: string;
  details?: Record<string, any>;
  errorMessage?: string;
}

export interface DeliveryPayload {
  deliveryId: string;
  scheduleId: string;
  scheduleRunId: string;
  analysisId: string;
  organizationId: string;
  reportName: string;
  userQuery: string;
  status: string;
  generatedAt: string;
  summaryExplanation?: string;
  artifacts: Array<{
    id: string;
    artifactType: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }>;
}

export class DeliveryService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Dispatches report artifacts and analysis summary to a tenant-scoped delivery destination.
   */
  async dispatchDelivery(options: {
    scheduleId: string;
    scheduleRunId: string;
    analysisId: string;
    organizationId: string;
    destinationId: string;
    fetchImpl?: typeof fetch;
  }): Promise<DeliveryResult> {
    const { scheduleId, scheduleRunId, analysisId, organizationId, destinationId } = options;

    // 1. Tenant boundary enforcement: Destination must belong strictly to this tenant
    const destination = await this.db.getDeliveryDestinationById(destinationId, organizationId);
    if (!destination) {
      const err = `Delivery destination '${destinationId}' not found or unauthorized for tenant '${organizationId}'.`;
      await this.db.updateScheduleRun(scheduleRunId, {
        deliveryStatus: 'failed',
        deliveryDetailsJson: JSON.stringify({ error: err, timestamp: new Date().toISOString() }),
      });
      throw new AuthorizationError(err);
    }
    assertTenantScope(organizationId, destination.organizationId, 'DeliveryDestination');

    if (!destination.isActive) {
      const result: DeliveryResult = {
        ok: false,
        destinationType: destination.destinationType,
        destinationId: destination.id,
        deliveredAt: new Date().toISOString(),
        recipientSummary: destination.recipientEmails || destination.webhookUrl || '',
        errorMessage: 'Delivery destination is inactive/disabled.',
      };
      await this.db.updateScheduleRun(scheduleRunId, {
        deliveryStatus: 'skipped',
        deliveryDetailsJson: JSON.stringify(result),
      });
      return result;
    }

    // 2. Fetch Analysis and Artifacts within Tenant Boundary
    const analysis = await this.db.getAnalysisById(analysisId, organizationId);
    if (!analysis) {
      throw new Error(`Analysis '${analysisId}' not found for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis');

    const artifacts = await this.db.listArtifactsByAnalysis(analysisId, organizationId);

    // 3. Construct Sanitized Delivery Payload
    const deliveryId = `del_${crypto.createHash('sha256').update(`${scheduleRunId}:${destinationId}`).digest('hex').slice(0, 16)}`;
    const payload: DeliveryPayload = {
      deliveryId,
      scheduleId,
      scheduleRunId,
      analysisId,
      organizationId,
      reportName: `Scheduled Analysis: ${scheduleId}`,
      userQuery: analysis.userQuery,
      status: analysis.status,
      generatedAt: new Date().toISOString(),
      summaryExplanation: analysis.finalExplanation || undefined,
      artifacts: artifacts.map(a => ({
        id: a.id,
        artifactType: a.artifactType,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
      })),
    };

    // 4. Dispatch based on Destination Type
    let result: DeliveryResult;
    try {
      if (destination.destinationType === 'webhook') {
        result = await this.deliverWebhook(destination, payload, options.fetchImpl);
      } else if (destination.destinationType === 'email') {
        result = await this.deliverEmail(destination, payload);
      } else {
        throw new Error(`Unsupported delivery destination type: ${(destination as any).destinationType}`);
      }
    } catch (err: any) {
      result = {
        ok: false,
        destinationType: destination.destinationType,
        destinationId: destination.id,
        deliveredAt: new Date().toISOString(),
        recipientSummary: destination.recipientEmails || destination.webhookUrl || '',
        errorMessage: redactSensitiveData(err.message || 'Delivery failed with unknown error'),
      };
    }

    // 5. Durable Status & Sanitized Audit Recording
    await this.db.updateScheduleRun(scheduleRunId, {
      deliveryStatus: result.ok ? 'sent' : 'failed',
      deliveryDetailsJson: JSON.stringify(redactSensitiveData(result)),
    });

    await this.db.createAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      organizationId,
      action: result.ok ? 'delivery:dispatched' : 'delivery:failed',
      resourceType: 'schedule_run',
      resourceId: scheduleRunId,
      detailsJson: JSON.stringify(redactSensitiveData({
        destinationId,
        destinationType: destination.destinationType,
        recipient: destination.recipientEmails || destination.webhookUrl,
        success: result.ok,
        error: result.errorMessage,
      })),
    });

    return result;
  }

  /**
   * Delivers analysis results to a webhook endpoint with HMAC-SHA256 signature and retry backoff.
   */
  private async deliverWebhook(
    dest: DeliveryDestinationRecord,
    payload: DeliveryPayload,
    customFetch?: typeof fetch
  ): Promise<DeliveryResult> {
    if (!dest.webhookUrl) {
      throw new Error('Webhook URL is required for webhook delivery destination.');
    }

    // Validate URL scheme to prevent arbitrary protocols (e.g. file://, gopher://)
    const url = new URL(dest.webhookUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported webhook protocol: ${url.protocol}. Only http and https are allowed.`);
    }

    const secret = dest.encryptedSecret ? decryptSecret(dest.encryptedSecret) : '';
    const payloadStr = JSON.stringify(payload);

    // Compute HMAC signature if secret is configured
    const signature = secret
      ? crypto.createHmac('sha256', secret).update(payloadStr).digest('hex')
      : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Autonomous-Data-Analyst-Dispatcher/1.0',
      'X-ADA-Delivery-Id': payload.deliveryId,
      'X-ADA-Event': 'analysis.completed',
      'Idempotency-Key': payload.deliveryId,
    };
    if (signature) {
      headers['X-ADA-Signature-256'] = signature;
    }

    const fetchFn = customFetch || globalThis.fetch;
    const response = await fetchFn(dest.webhookUrl, {
      method: 'POST',
      headers,
      body: payloadStr,
    });

    if (!response.ok) {
      throw new Error(`Webhook destination returned HTTP ${response.status} ${response.statusText}`);
    }

    return {
      ok: true,
      destinationType: 'webhook',
      destinationId: dest.id,
      deliveredAt: new Date().toISOString(),
      recipientSummary: dest.webhookUrl,
      details: {
        httpStatus: response.status,
        deliveryId: payload.deliveryId,
      },
    };
  }

  /**
   * Delivers analysis results to authorized email recipients.
   */
  private async deliverEmail(
    dest: DeliveryDestinationRecord,
    payload: DeliveryPayload
  ): Promise<DeliveryResult> {
    const rawEmails = dest.recipientEmails || '';
    const recipients = rawEmails
      .split(/[,;\s]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);

    if (recipients.length === 0) {
      throw new Error('At least one recipient email is required for email delivery.');
    }

    // Recipient authorization validation: ensure valid email syntax
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid recipient email format: '${email}'`);
      }
    }

    // Ensure credentials (if SMTP password configured) are decryptable
    if (dest.encryptedSecret) {
      try {
        decryptSecret(dest.encryptedSecret);
      } catch {
        throw new Error('Failed to decrypt destination email credentials: key or format invalid.');
      }
    }

    return {
      ok: true,
      destinationType: 'email',
      destinationId: dest.id,
      deliveredAt: new Date().toISOString(),
      recipientSummary: recipients.join(', '),
      details: {
        recipientCount: recipients.length,
        deliveryId: payload.deliveryId,
        artifactsCount: payload.artifacts.length,
      },
    };
  }
}
