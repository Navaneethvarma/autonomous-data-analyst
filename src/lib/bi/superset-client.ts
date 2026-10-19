import {
  SupersetCredentials,
  SupersetDatasetSummary,
  SupersetChartPublishRequest,
  SupersetChartSummary,
  BiAuthenticationError,
  BiPermissionError,
  BiRateLimitError,
  BiConnectionError,
  BiIntegrationError,
} from './types.js';
import { redactSensitiveData } from '../security/encryption.js';

export class SupersetClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private fetchImpl: typeof fetch;

  constructor(
    hostUrl: string,
    private credentials: SupersetCredentials,
    customFetch?: typeof fetch
  ) {
    this.baseUrl = hostUrl.replace(/\/+$/, '');
    this.fetchImpl = customFetch || globalThis.fetch;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Normalizes and performs an authenticated request to the Superset REST API.
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    retryAuth = true
  ): Promise<T> {
    if ((!this.accessToken || Date.now() >= this.tokenExpiresAt) && endpoint !== '/api/v1/security/login') {
      await this.authenticate();
    }

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...options,
        headers,
      });
    } catch (err: any) {
      throw new BiConnectionError(`Failed to connect to Apache Superset at ${this.baseUrl}: ${err.message}`);
    }

    // Handle 401 Unauthorized / Expired Token
    if (response.status === 401) {
      if (retryAuth && endpoint !== '/api/v1/security/login') {
        this.accessToken = null;
        await this.authenticate();
        return this.request<T>(endpoint, options, false);
      }
      throw new BiAuthenticationError('Apache Superset authentication failed: invalid credentials or expired token.');
    }

    // Handle 403 Forbidden
    if (response.status === 403) {
      throw new BiPermissionError('Apache Superset permission denied: role lacks required privileges for this resource.');
    }

    // Handle 429 Rate Limit
    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After');
      const retrySeconds = retryHeader ? parseInt(retryHeader, 10) : 60;
      throw new BiRateLimitError(`Apache Superset rate limit reached. Retry after ${retrySeconds} seconds.`, retrySeconds);
    }

    // Handle other errors
    if (!response.ok) {
      let errorBody = '';
      try {
        const bodyJson = await response.json();
        errorBody = bodyJson.message || JSON.stringify(bodyJson);
      } catch {
        errorBody = await response.text();
      }
      throw new BiIntegrationError(
        `Apache Superset API error (HTTP ${response.status}): ${redactSensitiveData(errorBody)}`,
        response.status
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }

  /**
   * Authenticates against Superset /api/v1/security/login and caches JWT in memory.
   */
  async authenticate(): Promise<{ ok: boolean }> {
    try {
      const res = await this.request<{ access_token: string; refresh_token?: string }>(
        '/api/v1/security/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username: this.credentials.username,
            password: this.credentials.password,
            provider: this.credentials.provider || 'db',
          }),
        },
        false
      );

      if (!res.access_token) {
        throw new BiAuthenticationError('Missing access_token in Superset authentication response.');
      }

      this.accessToken = res.access_token;
      this.refreshToken = res.refresh_token || null;
      // Default to 1 hour expiration if JWT exp not parsed
      this.tokenExpiresAt = Date.now() + 3600 * 1000;

      return { ok: true };
    } catch (err: any) {
      this.accessToken = null;
      if (err instanceof BiIntegrationError) throw err;
      throw new BiAuthenticationError(`Superset authentication failed: ${err.message}`);
    }
  }

  /**
   * Tests connection to Superset instance, validating credentials and instance responsiveness.
   */
  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();
    await this.authenticate();

    // Verify token validity by requesting dataset list or user profile
    await this.request('/api/v1/dataset/?q=(page:0,page_size:1)');
    const latencyMs = Date.now() - start;

    return {
      ok: true,
      latencyMs,
      message: `Successfully connected to Apache Superset in ${latencyMs}ms.`,
    };
  }

  /**
   * Discovers authorized datasets from Superset.
   */
  async listDatasets(): Promise<SupersetDatasetSummary[]> {
    const res = await this.request<{
      result: Array<{
        id: number;
        table_name: string;
        schema?: string;
        database?: { database_name: string };
        description?: string;
      }>;
    }>('/api/v1/dataset/?q=(page:0,page_size:100)');

    if (!res.result || !Array.isArray(res.result)) {
      return [];
    }

    return res.result.map(d => ({
      id: d.id,
      tableName: d.table_name,
      schema: d.schema || undefined,
      databaseName: d.database?.database_name || undefined,
      description: d.description || undefined,
    }));
  }

  /**
   * Publishes or syncs a dataset table registration in Superset.
   */
  async publishDataset(params: {
    databaseId: number;
    tableName: string;
    schema?: string;
  }): Promise<{ id: number }> {
    const res = await this.request<{ id: number }>(
      '/api/v1/dataset/',
      {
        method: 'POST',
        body: JSON.stringify({
          database: params.databaseId,
          table_name: params.tableName,
          schema: params.schema || null,
        }),
      }
    );
    return { id: res.id };
  }

  /**
   * Publishes a visualization chart to Superset.
   */
  async publishChart(chart: SupersetChartPublishRequest): Promise<SupersetChartSummary> {
    const res = await this.request<{ id: number }>(
      '/api/v1/chart/',
      {
        method: 'POST',
        body: JSON.stringify({
          slice_name: chart.sliceName,
          viz_type: chart.vizType,
          datasource_id: chart.datasourceId,
          datasource_type: chart.datasourceType || 'table',
          params: JSON.stringify(chart.params || {}),
          description: chart.description || null,
        }),
      }
    );

    return {
      id: res.id,
      sliceName: chart.sliceName,
      vizType: chart.vizType,
      url: `${this.baseUrl}/explore/?slice_id=${res.id}`,
    };
  }

  /**
   * Invalidates and clears in-memory tokens for revocation.
   */
  revokeTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }
}
