import { BaseRepository } from './base.repository.js';
import type { BiConnectionRecord } from '../types.js';

export interface IBiRepository {
  findById(id: string, organizationId?: string): Promise<BiConnectionRecord | null>;
  listForOrganization(organizationId: string): Promise<BiConnectionRecord[]>;
  create(conn: Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>): Promise<BiConnectionRecord>;
  update(id: string, updates: Partial<BiConnectionRecord>): Promise<void>;
  delete(id: string, organizationId: string): Promise<boolean>;
}

export class BiRepository extends BaseRepository implements IBiRepository {
  async findById(id: string, organizationId?: string): Promise<BiConnectionRecord | null> {
    return this.db.getBiConnectionById(id, organizationId);
  }

  async listForOrganization(organizationId: string): Promise<BiConnectionRecord[]> {
    return this.db.listBiConnectionsByOrg(organizationId);
  }

  async create(conn: Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>): Promise<BiConnectionRecord> {
    return this.db.createBiConnection(conn);
  }

  async update(id: string, updates: Partial<BiConnectionRecord>): Promise<void> {
    return this.db.updateBiConnection(id, updates);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return this.db.deleteBiConnection(id, organizationId);
  }
}
