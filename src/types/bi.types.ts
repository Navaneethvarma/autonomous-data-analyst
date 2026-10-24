/**
 * Business Intelligence (BI) integration domain and persistence types.
 */

export type BiPlatformType = 'superset' | 'metabase';
export type BiConnectionStatus = 'untested' | 'connected' | 'error';
export type BiExportStatus = 'pending' | 'exported' | 'failed' | 'skipped';

export interface BiConnectionRecord {
  id: string;
  organizationId: string;
  name: string;
  platformType: BiPlatformType;
  hostUrl: string;
  encryptedCredentials: string; // AES-256-GCM encrypted
  status: BiConnectionStatus;
  lastTestedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateBiConnectionInput = Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>;

export type UpdateBiConnectionInput = Partial<Omit<BiConnectionRecord, 'id' | 'organizationId' | 'createdAt'>>;

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
  params?: Record<string, unknown>;
  description?: string;
}

export interface SupersetChartSummary {
  id: number;
  sliceName: string;
  vizType: string;
  url: string;
}
