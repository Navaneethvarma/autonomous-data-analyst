/**
 * Dataset persistence models, storage options, and status enumerations.
 */

export type DatasetFormat = 'csv' | 'parquet';
export type DatasetStatus = 'registered' | 'profiling' | 'ready' | 'error';

export interface DatasetRecord {
  id: string;
  organizationId: string;
  uploadedByUserId: string;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  format: DatasetFormat;
  rowCount: number;
  columnCount: number;
  schemaFingerprint: string;
  status: DatasetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetProfileRecord {
  id: string;
  datasetId: string;
  profileJson: string; // JSON stringified DatasetProfile
  createdAt: string;
}

export interface CreateDatasetInput {
  id: string;
  organizationId: string;
  uploadedByUserId: string;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  format: DatasetFormat;
  rowCount: number;
  columnCount: number;
  schemaFingerprint: string;
  status: DatasetStatus;
}

export interface DatasetUploadOptions {
  originalFilename: string;
  buffer: Buffer;
}
