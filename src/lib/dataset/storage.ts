import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../db/types.js';
import { DatasetRepository, type IDatasetRepository } from '../db/repositories/index.js';
import { DatasetRecord, DatasetFormat } from '../db/types.js';
import { profileDataset } from './profiler.js';
import type { DatasetProfile } from './types.js';
import {
  PathTraversalError,
  UnsupportedFormatError,
  FileTooLargeError,
  DatasetEmptyError,
} from './validator.js';
import { assertTenantScope, assertPermission } from '../auth/rbac.js';
import type { AuthenticatedContext } from '../../types/auth.types.js';
import type { DatasetUploadOptions } from '../../types/dataset.types.js';
import { computeSchemaFingerprint } from '../observability/tracer.js';

export type { DatasetUploadOptions };

const ALLOWED_EXTENSIONS = new Set(['.csv', '.parquet']);
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export class DatasetStorageService {
  private baseDir: string;
  private datasetRepo: IDatasetRepository;

  constructor(
    dbOrRepo: DatabaseAdapter | IDatasetRepository,
    customBaseDir?: string
  ) {
    if ('createDataset' in dbOrRepo && 'saveDatasetProfile' in dbOrRepo && 'init' in dbOrRepo) {
      this.datasetRepo = new DatasetRepository(dbOrRepo as DatabaseAdapter);
    } else {
      this.datasetRepo = dbOrRepo as IDatasetRepository;
    }
    this.baseDir = customBaseDir || path.resolve(process.cwd(), 'datasets', 'tenants');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Securely saves and registers a dataset for a specific tenant and user.
   */
  async uploadAndRegisterDataset(
    auth: AuthenticatedContext,
    options: DatasetUploadOptions
  ): Promise<{ dataset: DatasetRecord; profile: DatasetProfile }> {
    assertPermission(auth.role, 'dataset:upload');

    // 1. Sanitize filename and validate extension
    const ext = path.extname(options.originalFilename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UnsupportedFormatError(
        `Unsupported dataset file extension '${ext}'. Only .csv and .parquet are supported.`
      );
    }
    const format: DatasetFormat = ext === '.csv' ? 'csv' : 'parquet';

    // 2. Size checks
    if (!options.buffer || options.buffer.length === 0) {
      throw new DatasetEmptyError('Dataset upload buffer is empty (0 bytes).');
    }
    if (options.buffer.length > DEFAULT_MAX_SIZE_BYTES) {
      throw new FileTooLargeError(
        `File size (${(options.buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${DEFAULT_MAX_SIZE_BYTES / (1024 * 1024)}MB.`
      );
    }

    // 3. Isolated Tenant Directory & Server-controlled Storage Path
    const tenantDir = path.resolve(this.baseDir, auth.organization.id);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    const datasetId = crypto.randomUUID();
    const storageFilename = `${datasetId}${ext}`;
    const targetPath = path.resolve(tenantDir, storageFilename);

    // Defense-in-depth: check path traversal
    if (!targetPath.startsWith(tenantDir)) {
      throw new PathTraversalError('Security violation: Storage path traverses outside tenant root.');
    }

    // Write file to disk atomically
    try {
      fs.writeFileSync(targetPath, options.buffer);
    } catch (err: any) {
      throw new Error(`Failed to persist dataset file: ${err.message}`);
    }

    // 4. Run Profiler to inspect schema & data profile
    let profile: DatasetProfile;
    try {
      profile = await profileDataset(targetPath, { customBaseDir: this.baseDir });
    } catch (profilingErr: any) {
      // Clean up orphaned file on failure
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch {
        // ignore cleanup error
      }
      throw new Error(`Dataset profiling failed: ${profilingErr.message}`);
    }

    // 5. Schema fingerprint
    const schemaFingerprint = computeSchemaFingerprint(
      profile.columns.map((c: any) => ({ name: c.name, inferredType: c.inferredType }))
    );

    // 6. Record in Database
    const dataset = await this.datasetRepo.create({
      id: datasetId,
      organizationId: auth.organization.id,
      uploadedByUserId: auth.user.id,
      originalFilename: path.basename(options.originalFilename),
      storagePath: targetPath,
      fileSizeBytes: options.buffer.length,
      format,
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      schemaFingerprint,
      status: 'ready',
    });

    await this.datasetRepo.saveProfile({
      id: crypto.randomUUID(),
      datasetId,
      profileJson: JSON.stringify(profile),
    });

    return { dataset, profile };
  }

  /**
   * Retrieves a dataset record with tenant validation.
   */
  async getDataset(auth: AuthenticatedContext, datasetId: string): Promise<DatasetRecord> {
    assertPermission(auth.role, 'dataset:read');

    const dataset = await this.datasetRepo.findById(datasetId);
    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found.`);
    }

    assertTenantScope(auth.organization.id, dataset.organizationId, 'Dataset');
    return dataset;
  }

  /**
   * Retrieves the profiled schema with tenant validation.
   */
  async getDatasetProfile(auth: AuthenticatedContext, datasetId: string): Promise<DatasetProfile | null> {
    const dataset = await this.getDataset(auth, datasetId);
    const profileRecord = await this.datasetRepo.getProfile(dataset.id);
    if (!profileRecord) return null;
    return JSON.parse(profileRecord.profileJson) as DatasetProfile;
  }

  /**
   * Lists all datasets authorized for the active organization.
   */
  async listDatasets(auth: AuthenticatedContext): Promise<DatasetRecord[]> {
    assertPermission(auth.role, 'dataset:read');
    return this.datasetRepo.listForOrganization(auth.organization.id);
  }

  /**
   * Deletes a dataset and cleans up underlying physical file.
   */
  async deleteDataset(auth: AuthenticatedContext, datasetId: string): Promise<void> {
    assertPermission(auth.role, 'dataset:delete');
    const dataset = await this.getDataset(auth, datasetId);

    // Remove file from disk
    try {
      if (fs.existsSync(dataset.storagePath)) {
        fs.unlinkSync(dataset.storagePath);
      }
    } catch {
      // file might already be removed
    }

    await this.datasetRepo.delete(dataset.id, auth.organization.id);
  }
}

