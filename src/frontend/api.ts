/**
 * Typed API Client for Autonomous Data Analyst Backend
 */

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  user: User;
  organization: Organization;
  role: 'admin' | 'analyst' | 'viewer';
  token: string;
  csrfToken: string;
}

export interface DatasetItem {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  format: string;
  rowCount: number;
  columnCount: number;
  schemaFingerprint: string;
  status: string;
  createdAt: string;
}

export interface DatasetColumnProfile {
  name: string;
  inferredType: string;
  nullCount: number;
  distinctCount: number;
  sampleValues: unknown[];
  stats?: {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    stdDev?: number;
  };
}

export interface DatasetProfile {
  datasetPath: string;
  rowCount: number;
  columnCount: number;
  fileSizeBytes: number;
  format: string;
  columns: DatasetColumnProfile[];
}

export interface AnalysisItem {
  id: string;
  organizationId: string;
  userId: string;
  datasetId: string;
  userQuery: string;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial_success';
  stage: string;
  progressPercent: number;
  executionResult?: any;
  validationResult?: any;
  insights?: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    confidence: string;
  }>;
  dashboardSpec?: any;
  clarificationQuestion?: string | null;
  finalExplanation?: string | null;
  errorMessage?: string | null;
  traceId?: string | null;
  runId?: string | null;
  createdAt: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('ada_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('ada_token', token);
    } else {
      localStorage.removeItem('ada_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(path, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMsg = `HTTP Error ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) errorMsg = body.error;
      } catch {
        // ignore parse error
      }
      throw new Error(errorMsg);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return res.json();
  }

  // Auth
  async register(data: { email: string; password: string; name: string }): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.setToken(res.token);
    return res;
  }

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.setToken(res.token);
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async me(): Promise<{ user: User; organization: Organization; role: string }> {
    return this.request('/api/auth/me');
  }

  // Datasets
  async uploadDataset(filename: string, content: string): Promise<{ dataset: DatasetItem; profile: DatasetProfile }> {
    return this.request('/api/datasets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
  }

  async listDatasets(): Promise<DatasetItem[]> {
    return this.request<DatasetItem[]>('/api/datasets');
  }

  async getDataset(id: string): Promise<DatasetItem> {
    return this.request<DatasetItem>(`/api/datasets/${id}`);
  }

  async getDatasetProfile(id: string): Promise<DatasetProfile> {
    return this.request<DatasetProfile>(`/api/datasets/${id}/profile`);
  }

  async getDatasetPreview(id: string, limit = 20): Promise<{ rows: any[]; columns: string[] }> {
    return this.request(`/api/datasets/${id}/preview?limit=${limit}`);
  }

  // Analyses
  async createAnalysis(datasetId: string, userQuery: string): Promise<{ analysisId: string; jobId: string }> {
    return this.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, userQuery }),
    });
  }

  async listAnalyses(): Promise<AnalysisItem[]> {
    return this.request<AnalysisItem[]>('/api/analyses');
  }

  async getAnalysis(id: string): Promise<AnalysisItem> {
    return this.request<AnalysisItem>(`/api/analyses/${id}`);
  }

  async cancelAnalysis(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/analyses/${id}/cancel`, { method: 'POST' });
  }

  getArtifactDownloadUrl(artifactId: string): string {
    return `/api/artifacts/${artifactId}`;
  }

  // Schedules (Milestone 12)
  async listSchedules(): Promise<ScheduleItem[]> {
    const res = await this.request<{ schedules: ScheduleItem[] }>('/api/schedules');
    return res.schedules || [];
  }

  async createSchedule(data: {
    datasetId: string;
    name: string;
    userQuery: string;
    scheduleType: 'recurring' | 'one_time';
    cronExpression?: string;
    timezone?: string;
    oneTimeRunAt?: string;
    concurrencyLimit?: number;
    deliveryDestinationId?: string;
    biConnectionId?: string;
    exportFormat?: 'html' | 'pdf' | 'both';
  }): Promise<{ schedule: ScheduleItem }> {
    return this.request('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async triggerSchedule(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/schedules/${id}/trigger`, { method: 'POST' });
  }

  async deleteSchedule(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/schedules/${id}`, { method: 'DELETE' });
  }

  async listScheduleRuns(scheduleId: string): Promise<ScheduleRunItem[]> {
    const res = await this.request<{ runs: ScheduleRunItem[] }>(`/api/schedules/${scheduleId}/runs`);
    return res.runs || [];
  }

  // Delivery Destinations (Milestone 12)
  async listDeliveryDestinations(): Promise<DeliveryDestinationItem[]> {
    const res = await this.request<{ destinations: DeliveryDestinationItem[] }>('/api/delivery/destinations');
    return res.destinations || [];
  }

  async createDeliveryDestination(data: {
    name: string;
    destinationType: 'email' | 'webhook';
    recipientEmails?: string;
    webhookUrl?: string;
    secret?: string;
  }): Promise<{ destination: DeliveryDestinationItem }> {
    return this.request('/api/delivery/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteDeliveryDestination(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/delivery/destinations/${id}`, { method: 'DELETE' });
  }

  // BI Connections (Milestone 12)
  async listBiConnections(): Promise<BiConnectionItem[]> {
    const res = await this.request<{ connections: BiConnectionItem[] }>('/api/bi/connections');
    return res.connections || [];
  }

  async createBiConnection(data: {
    name: string;
    platformType: 'superset' | 'metabase';
    hostUrl: string;
    username: string;
    password: string;
  }): Promise<{ connection: BiConnectionItem }> {
    return this.request('/api/bi/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteBiConnection(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/bi/connections/${id}`, { method: 'DELETE' });
  }

  async testBiConnection(id: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    return this.request(`/api/bi/connections/${id}/test`, { method: 'POST' });
  }

  async exportAnalysisToBi(connectionId: string, analysisId: string): Promise<any> {
    return this.request(`/api/bi/connections/${connectionId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId }),
    });
  }
}

export interface ScheduleItem {
  id: string;
  organizationId: string;
  datasetId: string;
  name: string;
  userQuery: string;
  scheduleType: 'recurring' | 'one_time';
  cronExpression?: string | null;
  timezone: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  concurrencyLimit: number;
  isEnabled: boolean;
  deliveryDestinationId?: string | null;
  biConnectionId?: string | null;
  exportFormat: string;
  status: string;
  createdAt: string;
}

export interface ScheduleRunItem {
  id: string;
  scheduleId: string;
  scheduledFor: string;
  startedAt: string;
  completedAt?: string | null;
  status: string;
  deliveryStatus?: string | null;
  biExportStatus?: string | null;
  errorMessage?: string | null;
}

export interface DeliveryDestinationItem {
  id: string;
  name: string;
  destinationType: 'email' | 'webhook';
  recipientEmails?: string | null;
  webhookUrl?: string | null;
  hasSecret: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface BiConnectionItem {
  id: string;
  name: string;
  platformType: string;
  hostUrl: string;
  status: string;
  lastTestedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export const api = new ApiClient();
