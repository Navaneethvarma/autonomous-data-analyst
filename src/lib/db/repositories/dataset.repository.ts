import { BaseRepository } from './base.repository.js';
import type { DatasetRecord, DatasetProfileRecord } from '../types.js';

export interface IDatasetRepository {
  findById(id: string, organizationId?: string): Promise<DatasetRecord | null>;
  listForOrganization(organizationId: string): Promise<DatasetRecord[]>;
  create(dataset: Omit<DatasetRecord, 'createdAt' | 'updatedAt'>): Promise<DatasetRecord>;
  update(id: string, updates: Partial<DatasetRecord>): Promise<void>;
  delete(id: string, organizationId: string): Promise<boolean>;
  saveProfile(profile: Omit<DatasetProfileRecord, 'createdAt'>): Promise<DatasetProfileRecord>;
  getProfile(datasetId: string): Promise<DatasetProfileRecord | null>;
}

export class DatasetRepository extends BaseRepository implements IDatasetRepository {
  async findById(id: string, organizationId?: string): Promise<DatasetRecord | null> {
    return this.db.getDatasetById(id, organizationId);
  }

  async listForOrganization(organizationId: string): Promise<DatasetRecord[]> {
    return this.db.listDatasetsByOrg(organizationId);
  }

  async create(dataset: Omit<DatasetRecord, 'createdAt' | 'updatedAt'>): Promise<DatasetRecord> {
    return this.db.createDataset(dataset);
  }

  async update(id: string, updates: Partial<DatasetRecord>): Promise<void> {
    return this.db.updateDataset(id, updates);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return this.db.deleteDataset(id, organizationId);
  }

  async saveProfile(profile: Omit<DatasetProfileRecord, 'createdAt'>): Promise<DatasetProfileRecord> {
    return this.db.saveDatasetProfile(profile);
  }

  async getProfile(datasetId: string): Promise<DatasetProfileRecord | null> {
    return this.db.getDatasetProfile(datasetId);
  }
}
