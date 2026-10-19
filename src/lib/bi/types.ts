export interface SupersetCredentials {
  username: string;
  password: string;
  provider?: 'db' | 'ldap';
}

export interface SupersetDatasetSummary {
  id: number;
  tableName: string;
  schema?: string;
  databaseName?: string;
  description?: string;
}

export interface SupersetChartPublishRequest {
  sliceName: string;
  vizType: string;
  datasourceId: number;
  datasourceType?: 'table';
  params?: Record<string, any>;
  description?: string;
}

export interface SupersetChartSummary {
  id: number;
  sliceName: string;
  vizType: string;
  url: string;
}

export class BiIntegrationError extends Error {
  public statusCode?: number;
  public retryAfterSeconds?: number;

  constructor(message: string, statusCode?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'BiIntegrationError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BiAuthenticationError extends BiIntegrationError {
  constructor(message: string = 'BI platform authentication failed: invalid credentials or token.') {
    super(message, 401);
    this.name = 'BiAuthenticationError';
  }
}

export class BiPermissionError extends BiIntegrationError {
  constructor(message: string = 'BI platform permission denied: insufficient privileges.') {
    super(message, 403);
    this.name = 'BiPermissionError';
  }
}

export class BiRateLimitError extends BiIntegrationError {
  constructor(message: string = 'BI platform rate limit exceeded.', retryAfterSeconds?: number) {
    super(message, 429, retryAfterSeconds);
    this.name = 'BiRateLimitError';
  }
}

export class BiConnectionError extends BiIntegrationError {
  constructor(message: string = 'BI platform connection failed: host unreachable.') {
    super(message, 502);
    this.name = 'BiConnectionError';
  }
}
