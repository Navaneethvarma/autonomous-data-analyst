import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/adapter.js';
import { SupersetClient } from './superset-client.js';
import { decryptSecret, encryptSecret, redactSensitiveData } from '../security/encryption.js';
import { assertTenantScope, AuthorizationError } from '../auth/rbac.js';
import { SupersetCredentials, SupersetChartSummary } from './types.js';

export interface BiExportResult {
  ok: boolean;
  connectionId: string;
  platformType: string;
  exportedCharts: SupersetChartSummary[];
  details?: Record<string, any>;
  errorMessage?: string;
}

export class BiIntegrationService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Tests a BI connection, validating credentials and instance reachability.
   */
  async testConnection(
    connectionId: string,
    organizationId: string,
    customFetch?: typeof fetch
  ): Promise<{ ok: boolean; message: string; latencyMs: number }> {
    const conn = await this.db.getBiConnectionById(connectionId, organizationId);
    if (!conn) {
      throw new AuthorizationError(`BI connection '${connectionId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, conn.organizationId, 'BiConnection');

    let creds: SupersetCredentials;
    try {
      creds = JSON.parse(decryptSecret(conn.encryptedCredentials));
    } catch {
      throw new Error('Failed to decrypt BI connection credentials.');
    }

    const client = new SupersetClient(conn.hostUrl, creds, customFetch);
    const start = Date.now();
    try {
      const res = await client.testConnection();
      await this.db.updateBiConnection(connectionId, {
        status: 'connected',
        lastTestedAt: new Date().toISOString(),
        lastError: null,
      });

      await this.db.createAuditLog({
        id: `audit_${crypto.randomUUID()}`,
        organizationId,
        action: 'bi:connection_tested',
        resourceType: 'bi_connection',
        resourceId: connectionId,
        detailsJson: JSON.stringify({ success: true, latencyMs: res.latencyMs }),
      });

      return {
        ok: true,
        message: res.message || 'Connected successfully.',
        latencyMs: res.latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const sanitizedErr = redactSensitiveData(err.message || 'Connection test failed');
      await this.db.updateBiConnection(connectionId, {
        status: 'error',
        lastTestedAt: new Date().toISOString(),
        lastError: sanitizedErr,
      });

      await this.db.createAuditLog({
        id: `audit_${crypto.randomUUID()}`,
        organizationId,
        action: 'bi:connection_test_failed',
        resourceType: 'bi_connection',
        resourceId: connectionId,
        detailsJson: JSON.stringify({ success: false, error: sanitizedErr }),
      });

      return {
        ok: false,
        message: sanitizedErr,
        latencyMs,
      };
    }
  }

  /**
   * Exports an analysis's dashboard charts to the connected BI platform (Apache Superset).
   */
  async exportAnalysis(options: {
    connectionId: string;
    organizationId: string;
    analysisId: string;
    scheduleRunId?: string;
    datasourceId?: number;
    customFetch?: typeof fetch;
  }): Promise<BiExportResult> {
    const { connectionId, organizationId, analysisId, scheduleRunId, datasourceId = 1, customFetch } = options;

    const conn = await this.db.getBiConnectionById(connectionId, organizationId);
    if (!conn) {
      throw new AuthorizationError(`BI connection '${connectionId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, conn.organizationId, 'BiConnection');

    const analysis = await this.db.getAnalysisById(analysisId, organizationId);
    if (!analysis) {
      throw new Error(`Analysis '${analysisId}' not found for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, analysis.organizationId, 'Analysis');

    let creds: SupersetCredentials;
    try {
      creds = JSON.parse(decryptSecret(conn.encryptedCredentials));
    } catch {
      throw new Error('Failed to decrypt BI connection credentials.');
    }

    const client = new SupersetClient(conn.hostUrl, creds, customFetch);
    const exportedCharts: SupersetChartSummary[] = [];

    try {
      // Parse dashboard spec if available to determine charts to export
      let chartsToPublish: Array<{ title: string; chartType: string; metricName?: string }> = [];

      if (analysis.dashboardSpecJson) {
        try {
          const spec = JSON.parse(analysis.dashboardSpecJson);
          if (Array.isArray(spec.cards)) {
            for (const card of spec.cards) {
              chartsToPublish.push({
                title: card.title || 'Analysis Chart',
                chartType: card.chartType === 'line' ? 'echarts_timeseries_line' : 'table',
                metricName: card.metricKey || undefined,
              });
            }
          }
        } catch {
          // Fall back to default chart
        }
      }

      if (chartsToPublish.length === 0) {
        chartsToPublish.push({
          title: `Analysis: ${analysis.userQuery.slice(0, 50)}`,
          chartType: 'table',
        });
      }

      // Publish charts
      for (const item of chartsToPublish) {
        const chartSummary = await client.publishChart({
          sliceName: `${item.title} (${new Date().toLocaleDateString()})`,
          vizType: item.chartType,
          datasourceId,
          params: {
            metrics: item.metricName ? [item.metricName] : ['count'],
            query: analysis.userQuery,
          },
          description: analysis.finalExplanation || undefined,
        });
        exportedCharts.push(chartSummary);
      }

      const result: BiExportResult = {
        ok: true,
        connectionId: conn.id,
        platformType: conn.platformType,
        exportedCharts,
        details: { count: exportedCharts.length },
      };

      if (scheduleRunId) {
        await this.db.updateScheduleRun(scheduleRunId, {
          biExportStatus: 'exported',
          biExportDetailsJson: JSON.stringify(redactSensitiveData(result)),
        });
      }

      await this.db.createAuditLog({
        id: `audit_${crypto.randomUUID()}`,
        organizationId,
        action: 'bi:charts_exported',
        resourceType: 'bi_connection',
        resourceId: connectionId,
        detailsJson: JSON.stringify({
          analysisId,
          exportedCount: exportedCharts.length,
        }),
      });

      return result;
    } catch (err: any) {
      const sanitizedErr = redactSensitiveData(err.message || 'BI export failed');

      if (scheduleRunId) {
        await this.db.updateScheduleRun(scheduleRunId, {
          biExportStatus: 'failed',
          biExportDetailsJson: JSON.stringify({ error: sanitizedErr, timestamp: new Date().toISOString() }),
        });
      }

      return {
        ok: false,
        connectionId: conn.id,
        platformType: conn.platformType,
        exportedCharts: [],
        errorMessage: sanitizedErr,
      };
    }
  }

  /**
   * Rotates credentials for a BI connection, securely encrypting new credentials.
   */
  async rotateCredentials(
    connectionId: string,
    organizationId: string,
    newCredentials: SupersetCredentials
  ): Promise<void> {
    const conn = await this.db.getBiConnectionById(connectionId, organizationId);
    if (!conn) {
      throw new AuthorizationError(`BI connection '${connectionId}' not found or unauthorized for tenant '${organizationId}'.`);
    }
    assertTenantScope(organizationId, conn.organizationId, 'BiConnection');

    const encrypted = encryptSecret(JSON.stringify(newCredentials));
    await this.db.updateBiConnection(connectionId, {
      encryptedCredentials: encrypted,
      status: 'untested',
      lastError: null,
    });

    await this.db.createAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      organizationId,
      action: 'bi:credentials_rotated',
      resourceType: 'bi_connection',
      resourceId: connectionId,
      detailsJson: JSON.stringify({ rotatedAt: new Date().toISOString() }),
    });
  }
}
