/**
 * In-Memory Database Adapter for unit tests and local/offline execution.
 */

import type { DatabaseAdapter } from './types.js';
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
} from './types.js';

export class MemoryDbAdapter implements DatabaseAdapter {
  private organizations = new Map<string, OrganizationRecord>();
  private users = new Map<string, UserRecord>();
  private memberships = new Map<string, MembershipRecord>(); // key: `${orgId}:${userId}`
  private sessions = new Map<string, SessionRecord>(); // key: tokenHash
  private datasets = new Map<string, DatasetRecord>();
  private datasetProfiles = new Map<string, DatasetProfileRecord>(); // key: datasetId
  private analyses = new Map<string, AnalysisRecord>();
  private artifacts = new Map<string, ArtifactRecord>();
  private schedules = new Map<string, ScheduleRecord>();
  private scheduleRuns = new Map<string, ScheduleRunRecord>();
  private deliveryDestinations = new Map<string, DeliveryDestinationRecord>();
  private biConnections = new Map<string, BiConnectionRecord>();
  private auditLogs: AuditLogRecord[] = [];

  async init(): Promise<void> {
    // In-memory initialization
  }

  async close(): Promise<void> {
    this.organizations.clear();
    this.users.clear();
    this.memberships.clear();
    this.sessions.clear();
    this.datasets.clear();
    this.datasetProfiles.clear();
    this.analyses.clear();
    this.artifacts.clear();
    this.schedules.clear();
    this.scheduleRuns.clear();
    this.deliveryDestinations.clear();
    this.biConnections.clear();
    this.auditLogs = [];
  }

  async createOrganization(org: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord> {
    const now = new Date().toISOString();
    const record: OrganizationRecord = { ...org, createdAt: now, updatedAt: now };
    this.organizations.set(org.id, record);
    return record;
  }

  async getOrganizationById(id: string): Promise<OrganizationRecord | null> {
    return this.organizations.get(id) || null;
  }

  async getOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  async createUser(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    const now = new Date().toISOString();
    const record: UserRecord = { ...user, createdAt: now, updatedAt: now };
    this.users.set(user.id, record);
    return record;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  async createMembership(mem: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord> {
    const key = `${mem.organizationId}:${mem.userId}`;
    const record: MembershipRecord = { ...mem, createdAt: new Date().toISOString() };
    this.memberships.set(key, record);
    return record;
  }

  async getMembership(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    const key = `${organizationId}:${userId}`;
    return this.memberships.get(key) || null;
  }

  async getMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    return Array.from(this.memberships.values()).filter(m => m.userId === userId);
  }

  async updateMembershipRole(organizationId: string, userId: string, role: UserRole): Promise<void> {
    const key = `${organizationId}:${userId}`;
    const existing = this.memberships.get(key);
    if (existing) {
      existing.role = role;
    }
  }

  async createSession(session: Omit<SessionRecord, 'createdAt'>): Promise<SessionRecord> {
    const record: SessionRecord = { ...session, createdAt: new Date().toISOString() };
    this.sessions.set(session.tokenHash, record);
    return record;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    if (!s) return null;
    if (new Date(s.expiresAt) < new Date()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return s;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [hash, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        this.sessions.delete(hash);
      }
    }
  }

  async createDataset(dataset: Omit<DatasetRecord, 'createdAt' | 'updatedAt'>): Promise<DatasetRecord> {
    const now = new Date().toISOString();
    const record: DatasetRecord = { ...dataset, createdAt: now, updatedAt: now };
    this.datasets.set(dataset.id, record);
    return record;
  }

  async getDatasetById(id: string, organizationId?: string): Promise<DatasetRecord | null> {
    const d = this.datasets.get(id);
    if (!d) return null;
    if (organizationId && d.organizationId !== organizationId) return null;
    return d;
  }

  async listDatasetsByOrg(organizationId: string): Promise<DatasetRecord[]> {
    return Array.from(this.datasets.values())
      .filter(d => d.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateDataset(id: string, updates: Partial<DatasetRecord>): Promise<void> {
    const existing = this.datasets.get(id);
    if (existing) {
      Object.assign(existing, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async deleteDataset(id: string, organizationId: string): Promise<boolean> {
    const d = this.datasets.get(id);
    if (!d || d.organizationId !== organizationId) return false;
    this.datasets.delete(id);
    this.datasetProfiles.delete(id);
    return true;
  }

  async saveDatasetProfile(profile: Omit<DatasetProfileRecord, 'createdAt'>): Promise<DatasetProfileRecord> {
    const record: DatasetProfileRecord = { ...profile, createdAt: new Date().toISOString() };
    this.datasetProfiles.set(profile.datasetId, record);
    return record;
  }

  async getDatasetProfile(datasetId: string): Promise<DatasetProfileRecord | null> {
    return this.datasetProfiles.get(datasetId) || null;
  }

  async createAnalysis(analysis: Omit<AnalysisRecord, 'createdAt' | 'updatedAt'>): Promise<AnalysisRecord> {
    const now = new Date().toISOString();
    const record: AnalysisRecord = { ...analysis, createdAt: now, updatedAt: now };
    this.analyses.set(analysis.id, record);
    return record;
  }

  async getAnalysisById(id: string, organizationId?: string): Promise<AnalysisRecord | null> {
    const a = this.analyses.get(id);
    if (!a) return null;
    if (organizationId && a.organizationId !== organizationId) return null;
    return a;
  }

  async getAnalysisByJobId(jobId: string): Promise<AnalysisRecord | null> {
    for (const a of this.analyses.values()) {
      if (a.jobId === jobId) return a;
    }
    return null;
  }

  async listAnalysesByOrg(organizationId: string): Promise<AnalysisRecord[]> {
    return Array.from(this.analyses.values())
      .filter(a => a.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateAnalysis(id: string, updates: Partial<AnalysisRecord>): Promise<void> {
    const a = this.analyses.get(id);
    if (a) {
      Object.assign(a, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async createArtifact(artifact: Omit<ArtifactRecord, 'createdAt'>): Promise<ArtifactRecord> {
    const record: ArtifactRecord = { ...artifact, createdAt: new Date().toISOString() };
    this.artifacts.set(artifact.id, record);
    return record;
  }

  async getArtifactById(id: string, organizationId?: string): Promise<ArtifactRecord | null> {
    const art = this.artifacts.get(id);
    if (!art) return null;
    if (organizationId && art.organizationId !== organizationId) return null;
    return art;
  }

  async listArtifactsByAnalysis(analysisId: string, organizationId?: string): Promise<ArtifactRecord[]> {
    return Array.from(this.artifacts.values()).filter(art => {
      if (art.analysisId !== analysisId) return false;
      if (organizationId && art.organizationId !== organizationId) return false;
      return true;
    });
  }

  // Schedules (Milestone 12)
  async createSchedule(schedule: Omit<ScheduleRecord, 'createdAt' | 'updatedAt'>): Promise<ScheduleRecord> {
    const now = new Date().toISOString();
    const record: ScheduleRecord = { ...schedule, createdAt: now, updatedAt: now };
    this.schedules.set(record.id, record);
    return record;
  }

  async getScheduleById(id: string, organizationId?: string): Promise<ScheduleRecord | null> {
    const s = this.schedules.get(id);
    if (!s) return null;
    if (organizationId && s.organizationId !== organizationId) return null;
    return s;
  }

  async listSchedulesByOrg(organizationId: string): Promise<ScheduleRecord[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listDueSchedules(nowIso: string): Promise<ScheduleRecord[]> {
    const cutoff = new Date(nowIso).getTime();
    return Array.from(this.schedules.values()).filter(s => {
      if (!s.isEnabled || s.status !== 'active' || !s.nextRunAt) return false;
      return new Date(s.nextRunAt).getTime() <= cutoff;
    });
  }

  async updateSchedule(id: string, updates: Partial<ScheduleRecord>): Promise<void> {
    const s = this.schedules.get(id);
    if (s) {
      Object.assign(s, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async deleteSchedule(id: string, organizationId: string): Promise<boolean> {
    const s = this.schedules.get(id);
    if (!s || s.organizationId !== organizationId) return false;
    return this.schedules.delete(id);
  }

  // Schedule Runs (Milestone 12)
  async createScheduleRun(run: Omit<ScheduleRunRecord, 'createdAt'>): Promise<ScheduleRunRecord> {
    const now = new Date().toISOString();
    const record: ScheduleRunRecord = { ...run, createdAt: now };
    this.scheduleRuns.set(record.id, record);
    return record;
  }

  async getScheduleRunById(id: string, organizationId?: string): Promise<ScheduleRunRecord | null> {
    const r = this.scheduleRuns.get(id);
    if (!r) return null;
    if (organizationId && r.organizationId !== organizationId) return null;
    return r;
  }

  async listScheduleRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]> {
    return Array.from(this.scheduleRuns.values())
      .filter(r => r.scheduleId === scheduleId && r.organizationId === organizationId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async updateScheduleRun(id: string, updates: Partial<ScheduleRunRecord>): Promise<void> {
    const r = this.scheduleRuns.get(id);
    if (r) {
      Object.assign(r, updates);
    }
  }

  async getActiveRunCount(scheduleId: string): Promise<number> {
    let count = 0;
    for (const r of this.scheduleRuns.values()) {
      if (r.scheduleId === scheduleId && r.status === 'running') {
        count++;
      }
    }
    return count;
  }

  // Delivery Destinations (Milestone 12)
  async createDeliveryDestination(dest: Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>): Promise<DeliveryDestinationRecord> {
    const now = new Date().toISOString();
    const record: DeliveryDestinationRecord = { ...dest, createdAt: now, updatedAt: now };
    this.deliveryDestinations.set(record.id, record);
    return record;
  }

  async getDeliveryDestinationById(id: string, organizationId?: string): Promise<DeliveryDestinationRecord | null> {
    const d = this.deliveryDestinations.get(id);
    if (!d) return null;
    if (organizationId && d.organizationId !== organizationId) return null;
    return d;
  }

  async listDeliveryDestinationsByOrg(organizationId: string): Promise<DeliveryDestinationRecord[]> {
    return Array.from(this.deliveryDestinations.values())
      .filter(d => d.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateDeliveryDestination(id: string, updates: Partial<DeliveryDestinationRecord>): Promise<void> {
    const d = this.deliveryDestinations.get(id);
    if (d) {
      Object.assign(d, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async deleteDeliveryDestination(id: string, organizationId: string): Promise<boolean> {
    const d = this.deliveryDestinations.get(id);
    if (!d || d.organizationId !== organizationId) return false;
    return this.deliveryDestinations.delete(id);
  }

  // BI Platform Connections (Milestone 12)
  async createBiConnection(conn: Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>): Promise<BiConnectionRecord> {
    const now = new Date().toISOString();
    const record: BiConnectionRecord = { ...conn, createdAt: now, updatedAt: now };
    this.biConnections.set(record.id, record);
    return record;
  }

  async getBiConnectionById(id: string, organizationId?: string): Promise<BiConnectionRecord | null> {
    const c = this.biConnections.get(id);
    if (!c) return null;
    if (organizationId && c.organizationId !== organizationId) return null;
    return c;
  }

  async listBiConnectionsByOrg(organizationId: string): Promise<BiConnectionRecord[]> {
    return Array.from(this.biConnections.values())
      .filter(c => c.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateBiConnection(id: string, updates: Partial<BiConnectionRecord>): Promise<void> {
    const c = this.biConnections.get(id);
    if (c) {
      Object.assign(c, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async deleteBiConnection(id: string, organizationId: string): Promise<boolean> {
    const c = this.biConnections.get(id);
    if (!c || c.organizationId !== organizationId) return false;
    return this.biConnections.delete(id);
  }

  // Audit Logs (Milestone 12)
  async createAuditLog(log: Omit<AuditLogRecord, 'createdAt'>): Promise<AuditLogRecord> {
    const now = new Date().toISOString();
    const record: AuditLogRecord = { ...log, createdAt: now };
    this.auditLogs.push(record);
    return record;
  }

  async listAuditLogsByOrg(organizationId: string, limit = 100): Promise<AuditLogRecord[]> {
    return this.auditLogs
      .filter(l => l.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: 'In-memory database operational' };
  }
}
