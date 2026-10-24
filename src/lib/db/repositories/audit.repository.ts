import { BaseRepository } from './base.repository.js';
import type { AuditLogRecord } from '../types.js';

export interface IAuditRepository {
  create(log: Omit<AuditLogRecord, 'createdAt'>): Promise<AuditLogRecord>;
  listForOrganization(organizationId: string, limit?: number): Promise<AuditLogRecord[]>;
}

export class AuditRepository extends BaseRepository implements IAuditRepository {
  async create(log: Omit<AuditLogRecord, 'createdAt'>): Promise<AuditLogRecord> {
    return this.db.createAuditLog(log);
  }

  async listForOrganization(organizationId: string, limit?: number): Promise<AuditLogRecord[]> {
    return this.db.listAuditLogsByOrg(organizationId, limit);
  }
}
