export type {
  SupersetCredentials,
  SupersetDatasetSummary,
  SupersetChartPublishRequest,
  SupersetChartSummary,
} from '../../types/bi.types.js';

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
