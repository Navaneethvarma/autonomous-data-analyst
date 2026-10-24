import { BaseRepository } from './base.repository.js';
import type { DeliveryDestinationRecord } from '../types.js';

export interface IDeliveryRepository {
  findById(id: string, organizationId?: string): Promise<DeliveryDestinationRecord | null>;
  listForOrganization(organizationId: string): Promise<DeliveryDestinationRecord[]>;
  create(dest: Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>): Promise<DeliveryDestinationRecord>;
  update(id: string, updates: Partial<DeliveryDestinationRecord>): Promise<void>;
  delete(id: string, organizationId: string): Promise<boolean>;
}

export class DeliveryRepository extends BaseRepository implements IDeliveryRepository {
  async findById(id: string, organizationId?: string): Promise<DeliveryDestinationRecord | null> {
    return this.db.getDeliveryDestinationById(id, organizationId);
  }

  async listForOrganization(organizationId: string): Promise<DeliveryDestinationRecord[]> {
    return this.db.listDeliveryDestinationsByOrg(organizationId);
  }

  async create(dest: Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>): Promise<DeliveryDestinationRecord> {
    return this.db.createDeliveryDestination(dest);
  }

  async update(id: string, updates: Partial<DeliveryDestinationRecord>): Promise<void> {
    return this.db.updateDeliveryDestination(id, updates);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return this.db.deleteDeliveryDestination(id, organizationId);
  }
}
