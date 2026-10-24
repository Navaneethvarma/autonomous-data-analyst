import { BaseRepository } from './base.repository.js';
import type { OrganizationRecord } from '../types.js';

export interface IOrganizationRepository {
  findById(id: string): Promise<OrganizationRecord | null>;
  findBySlug(slug: string): Promise<OrganizationRecord | null>;
  create(org: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord>;
}

export class OrganizationRepository extends BaseRepository implements IOrganizationRepository {
  async findById(id: string): Promise<OrganizationRecord | null> {
    return this.db.getOrganizationById(id);
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | null> {
    return this.db.getOrganizationBySlug(slug);
  }

  async create(org: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord> {
    return this.db.createOrganization(org);
  }
}
