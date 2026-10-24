/**
 * Audit log domain and persistence types.
 */

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  detailsJson?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export type CreateAuditLogInput = Omit<AuditLogRecord, 'createdAt'>;
