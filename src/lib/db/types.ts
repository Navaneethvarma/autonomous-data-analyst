/**
 * Database persistence models, domain enumerations, and adapter contracts.
 * Canonical definitions are maintained in `src/types/`.
 */

import type {
  OrganizationRecord,
  UserRecord,
  MembershipRecord,
  SessionRecord,
  DatasetRecord,
  DatasetProfileRecord,
  AnalysisRecord,
  ArtifactRecord,
  UserRole,
  ScheduleRecord,
  ScheduleRunRecord,
  DeliveryDestinationRecord,
  BiConnectionRecord,
  AuditLogRecord,
} from '../../types/index.js';

export * from '../../types/index.js';

export interface DatabaseAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Organization
  createOrganization(org: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord>;
  getOrganizationById(id: string): Promise<OrganizationRecord | null>;
  getOrganizationBySlug(slug: string): Promise<OrganizationRecord | null>;

  // User
  createUser(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord>;
  getUserById(id: string): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;

  // Membership
  createMembership(mem: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord>;
  getMembership(organizationId: string, userId: string): Promise<MembershipRecord | null>;
  getMembershipsByUser(userId: string): Promise<MembershipRecord[]>;
  updateMembershipRole(organizationId: string, userId: string, role: UserRole): Promise<void>;

  // Session
  createSession(session: Omit<SessionRecord, 'createdAt'>): Promise<SessionRecord>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  // Dataset
  createDataset(dataset: Omit<DatasetRecord, 'createdAt' | 'updatedAt'>): Promise<DatasetRecord>;
  getDatasetById(id: string, organizationId?: string): Promise<DatasetRecord | null>;
  listDatasetsByOrg(organizationId: string): Promise<DatasetRecord[]>;
  updateDataset(id: string, updates: Partial<DatasetRecord>): Promise<void>;
  deleteDataset(id: string, organizationId: string): Promise<boolean>;

  // Dataset Profile
  saveDatasetProfile(profile: Omit<DatasetProfileRecord, 'createdAt'>): Promise<DatasetProfileRecord>;
  getDatasetProfile(datasetId: string): Promise<DatasetProfileRecord | null>;

  // Analysis
  createAnalysis(analysis: Omit<AnalysisRecord, 'createdAt' | 'updatedAt'>): Promise<AnalysisRecord>;
  getAnalysisById(id: string, organizationId?: string): Promise<AnalysisRecord | null>;
  getAnalysisByJobId(jobId: string): Promise<AnalysisRecord | null>;
  listAnalysesByOrg(organizationId: string): Promise<AnalysisRecord[]>;
  updateAnalysis(id: string, updates: Partial<AnalysisRecord>): Promise<void>;

  // Artifact
  createArtifact(artifact: Omit<ArtifactRecord, 'createdAt'>): Promise<ArtifactRecord>;
  getArtifactById(id: string, organizationId?: string): Promise<ArtifactRecord | null>;
  listArtifactsByAnalysis(analysisId: string, organizationId?: string): Promise<ArtifactRecord[]>;

  // Schedules (Milestone 12)
  createSchedule(schedule: Omit<ScheduleRecord, 'createdAt' | 'updatedAt'>): Promise<ScheduleRecord>;
  getScheduleById(id: string, organizationId?: string): Promise<ScheduleRecord | null>;
  listSchedulesByOrg(organizationId: string): Promise<ScheduleRecord[]>;
  listDueSchedules(nowIso: string): Promise<ScheduleRecord[]>;
  updateSchedule(id: string, updates: Partial<ScheduleRecord>): Promise<void>;
  deleteSchedule(id: string, organizationId: string): Promise<boolean>;

  // Schedule Runs (Milestone 12)
  createScheduleRun(run: Omit<ScheduleRunRecord, 'createdAt'>): Promise<ScheduleRunRecord>;
  getScheduleRunById(id: string, organizationId?: string): Promise<ScheduleRunRecord | null>;
  listScheduleRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]>;
  updateScheduleRun(id: string, updates: Partial<ScheduleRunRecord>): Promise<void>;
  getActiveRunCount(scheduleId: string): Promise<number>;

  // Delivery Destinations (Milestone 12)
  createDeliveryDestination(dest: Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>): Promise<DeliveryDestinationRecord>;
  getDeliveryDestinationById(id: string, organizationId?: string): Promise<DeliveryDestinationRecord | null>;
  listDeliveryDestinationsByOrg(organizationId: string): Promise<DeliveryDestinationRecord[]>;
  updateDeliveryDestination(id: string, updates: Partial<DeliveryDestinationRecord>): Promise<void>;
  deleteDeliveryDestination(id: string, organizationId: string): Promise<boolean>;

  // BI Platform Connections (Milestone 12)
  createBiConnection(conn: Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>): Promise<BiConnectionRecord>;
  getBiConnectionById(id: string, organizationId?: string): Promise<BiConnectionRecord | null>;
  listBiConnectionsByOrg(organizationId: string): Promise<BiConnectionRecord[]>;
  updateBiConnection(id: string, updates: Partial<BiConnectionRecord>): Promise<void>;
  deleteBiConnection(id: string, organizationId: string): Promise<boolean>;

  // Audit Logs (Milestone 12)
  createAuditLog(log: Omit<AuditLogRecord, 'createdAt'>): Promise<AuditLogRecord>;
  listAuditLogsByOrg(organizationId: string, limit?: number): Promise<AuditLogRecord[]>;

  // Health
  checkHealth(): Promise<{ ok: boolean; message?: string }>;
}
