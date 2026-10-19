import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
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

/**
 * In-Memory Database Adapter for unit tests and offline environments.
 */
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

/**
 * PostgreSQL Database Adapter.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async init(): Promise<void> {
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS _migrations (
            version VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        const appliedRes = await client.query('SELECT version FROM _migrations');
        const appliedVersions = new Set<string>(appliedRes.rows.map(r => r.version));

        for (const file of files) {
          const version = file.split('_')[0] || file;
          if (!appliedVersions.has(version)) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query('BEGIN');
            try {
              await client.query(sql);
              await client.query(
                `INSERT INTO _migrations (version, name, applied_at)
                 VALUES ($1, $2, NOW())`,
                [version, file]
              );
              await client.query('COMMIT');
            } catch (migrationErr) {
              await client.query('ROLLBACK');
              throw migrationErr;
            }
          }
        }
      } finally {
        client.release();
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createOrganization(org: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord> {
    const res = await this.pool.query(
      `INSERT INTO organizations (id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, created_at as "createdAt", updated_at as "updatedAt"`,
      [org.id, org.name, org.slug]
    );
    return res.rows[0];
  }

  async getOrganizationById(id: string): Promise<OrganizationRecord | null> {
    const res = await this.pool.query(
      `SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt"
       FROM organizations WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
    const res = await this.pool.query(
      `SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt"
       FROM organizations WHERE slug = $1`,
      [slug]
    );
    return res.rows[0] || null;
  }

  async createUser(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    const res = await this.pool.query(
      `INSERT INTO users (id, email, name, password_hash, salt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, password_hash as "passwordHash", salt, created_at as "createdAt", updated_at as "updatedAt"`,
      [user.id, user.email, user.name, user.passwordHash, user.salt]
    );
    return res.rows[0];
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const res = await this.pool.query(
      `SELECT id, email, name, password_hash as "passwordHash", salt, created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const res = await this.pool.query(
      `SELECT id, email, name, password_hash as "passwordHash", salt, created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    return res.rows[0] || null;
  }

  async createMembership(mem: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord> {
    const res = await this.pool.query(
      `INSERT INTO memberships (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, organization_id as "organizationId", user_id as "userId", role, created_at as "createdAt"`,
      [mem.id, mem.organizationId, mem.userId, mem.role]
    );
    return res.rows[0];
  }

  async getMembership(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", role, created_at as "createdAt"
       FROM memberships WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );
    return res.rows[0] || null;
  }

  async getMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", role, created_at as "createdAt"
       FROM memberships WHERE user_id = $1`,
      [userId]
    );
    return res.rows;
  }

  async updateMembershipRole(organizationId: string, userId: string, role: UserRole): Promise<void> {
    await this.pool.query(
      `UPDATE memberships SET role = $1 WHERE organization_id = $2 AND user_id = $3`,
      [role, organizationId, userId]
    );
  }

  async createSession(session: Omit<SessionRecord, 'createdAt'>): Promise<SessionRecord> {
    const res = await this.pool.query(
      `INSERT INTO sessions (id, token_hash, user_id, organization_id, csrf_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, token_hash as "tokenHash", user_id as "userId", organization_id as "organizationId",
                 csrf_token as "csrfToken", expires_at as "expiresAt", created_at as "createdAt"`,
      [session.id, session.tokenHash, session.userId, session.organizationId, session.csrfToken, session.expiresAt]
    );
    return res.rows[0];
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const res = await this.pool.query(
      `SELECT id, token_hash as "tokenHash", user_id as "userId", organization_id as "organizationId",
              csrf_token as "csrfToken", expires_at as "expiresAt", created_at as "createdAt"
       FROM sessions WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  async createDataset(dataset: Omit<DatasetRecord, 'createdAt' | 'updatedAt'>): Promise<DatasetRecord> {
    const res = await this.pool.query(
      `INSERT INTO datasets (id, organization_id, uploaded_by_user_id, original_filename, storage_path, file_size_bytes, format, row_count, column_count, schema_fingerprint, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, organization_id as "organizationId", uploaded_by_user_id as "uploadedByUserId", original_filename as "originalFilename",
                 storage_path as "storagePath", file_size_bytes as "fileSizeBytes", format, row_count as "rowCount", column_count as "columnCount",
                 schema_fingerprint as "schemaFingerprint", status, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        dataset.id,
        dataset.organizationId,
        dataset.uploadedByUserId,
        dataset.originalFilename,
        dataset.storagePath,
        dataset.fileSizeBytes,
        dataset.format,
        dataset.rowCount,
        dataset.columnCount,
        dataset.schemaFingerprint,
        dataset.status,
      ]
    );
    return res.rows[0];
  }

  async getDatasetById(id: string, organizationId?: string): Promise<DatasetRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", uploaded_by_user_id as "uploadedByUserId", original_filename as "originalFilename",
                        storage_path as "storagePath", file_size_bytes as "fileSizeBytes", format, row_count as "rowCount", column_count as "columnCount",
                        schema_fingerprint as "schemaFingerprint", status, created_at as "createdAt", updated_at as "updatedAt"
                 FROM datasets WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listDatasetsByOrg(organizationId: string): Promise<DatasetRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", uploaded_by_user_id as "uploadedByUserId", original_filename as "originalFilename",
              storage_path as "storagePath", file_size_bytes as "fileSizeBytes", format, row_count as "rowCount", column_count as "columnCount",
              schema_fingerprint as "schemaFingerprint", status, created_at as "createdAt", updated_at as "updatedAt"
       FROM datasets WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async updateDataset(id: string, updates: Partial<DatasetRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE datasets SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async deleteDataset(id: string, organizationId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM datasets WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async saveDatasetProfile(profile: Omit<DatasetProfileRecord, 'createdAt'>): Promise<DatasetProfileRecord> {
    const res = await this.pool.query(
      `INSERT INTO dataset_profiles (id, dataset_id, profile_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (dataset_id) DO UPDATE SET profile_json = EXCLUDED.profile_json
       RETURNING id, dataset_id as "datasetId", profile_json as "profileJson", created_at as "createdAt"`,
      [profile.id, profile.datasetId, profile.profileJson]
    );
    return res.rows[0];
  }

  async getDatasetProfile(datasetId: string): Promise<DatasetProfileRecord | null> {
    const res = await this.pool.query(
      `SELECT id, dataset_id as "datasetId", profile_json as "profileJson", created_at as "createdAt"
       FROM dataset_profiles WHERE dataset_id = $1`,
      [datasetId]
    );
    return res.rows[0] || null;
  }

  async createAnalysis(analysis: Omit<AnalysisRecord, 'createdAt' | 'updatedAt'>): Promise<AnalysisRecord> {
    const res = await this.pool.query(
      `INSERT INTO analyses (
         id, organization_id, user_id, dataset_id, user_query, job_id, status, stage, progress_percent,
         execution_result_json, validation_result_json, insights_json, dashboard_spec_json,
         clarification_question, final_explanation, error_message, trace_id, run_id, retry_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id, organization_id as "organizationId", user_id as "userId", dataset_id as "datasetId",
                 user_query as "userQuery", job_id as "jobId", status, stage, progress_percent as "progressPercent",
                 execution_result_json as "executionResultJson", validation_result_json as "validationResultJson",
                 insights_json as "insightsJson", dashboard_spec_json as "dashboardSpecJson",
                 clarification_question as "clarificationQuestion", final_explanation as "finalExplanation",
                 error_message as "errorMessage", trace_id as "traceId", run_id as "runId", retry_count as "retryCount",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        analysis.id,
        analysis.organizationId,
        analysis.userId,
        analysis.datasetId,
        analysis.userQuery,
        analysis.jobId,
        analysis.status,
        analysis.stage,
        analysis.progressPercent,
        analysis.executionResultJson ?? null,
        analysis.validationResultJson ?? null,
        analysis.insightsJson ?? null,
        analysis.dashboardSpecJson ?? null,
        analysis.clarificationQuestion ?? null,
        analysis.finalExplanation ?? null,
        analysis.errorMessage ?? null,
        analysis.traceId ?? null,
        analysis.runId ?? null,
        analysis.retryCount ?? 0,
      ]
    );
    return res.rows[0];
  }

  async getAnalysisById(id: string, organizationId?: string): Promise<AnalysisRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", user_id as "userId", dataset_id as "datasetId",
                        user_query as "userQuery", job_id as "jobId", status, stage, progress_percent as "progressPercent",
                        execution_result_json as "executionResultJson", validation_result_json as "validationResultJson",
                        insights_json as "insightsJson", dashboard_spec_json as "dashboardSpecJson",
                        clarification_question as "clarificationQuestion", final_explanation as "finalExplanation",
                        error_message as "errorMessage", trace_id as "traceId", run_id as "runId", retry_count as "retryCount",
                        created_at as "createdAt", updated_at as "updatedAt"
                 FROM analyses WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async getAnalysisByJobId(jobId: string): Promise<AnalysisRecord | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", dataset_id as "datasetId",
              user_query as "userQuery", job_id as "jobId", status, stage, progress_percent as "progressPercent",
              execution_result_json as "executionResultJson", validation_result_json as "validationResultJson",
              insights_json as "insightsJson", dashboard_spec_json as "dashboardSpecJson",
              clarification_question as "clarificationQuestion", final_explanation as "finalExplanation",
              error_message as "errorMessage", trace_id as "traceId", run_id as "runId", retry_count as "retryCount",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM analyses WHERE job_id = $1`,
      [jobId]
    );
    return res.rows[0] || null;
  }

  async listAnalysesByOrg(organizationId: string): Promise<AnalysisRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", dataset_id as "datasetId",
              user_query as "userQuery", job_id as "jobId", status, stage, progress_percent as "progressPercent",
              execution_result_json as "executionResultJson", validation_result_json as "validationResultJson",
              insights_json as "insightsJson", dashboard_spec_json as "dashboardSpecJson",
              clarification_question as "clarificationQuestion", final_explanation as "finalExplanation",
              error_message as "errorMessage", trace_id as "traceId", run_id as "runId", retry_count as "retryCount",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM analyses WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async updateAnalysis(id: string, updates: Partial<AnalysisRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE analyses SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async createArtifact(artifact: Omit<ArtifactRecord, 'createdAt'>): Promise<ArtifactRecord> {
    const res = await this.pool.query(
      `INSERT INTO artifacts (id, organization_id, analysis_id, artifact_type, storage_path, file_name, mime_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id as "organizationId", analysis_id as "analysisId", artifact_type as "artifactType",
                 storage_path as "storagePath", file_name as "fileName", mime_type as "mimeType",
                 file_size_bytes as "fileSizeBytes", created_at as "createdAt"`,
      [
        artifact.id,
        artifact.organizationId,
        artifact.analysisId,
        artifact.artifactType,
        artifact.storagePath,
        artifact.fileName,
        artifact.mimeType,
        artifact.fileSizeBytes,
      ]
    );
    return res.rows[0];
  }

  async getArtifactById(id: string, organizationId?: string): Promise<ArtifactRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", analysis_id as "analysisId", artifact_type as "artifactType",
                        storage_path as "storagePath", file_name as "fileName", mime_type as "mimeType",
                        file_size_bytes as "fileSizeBytes", created_at as "createdAt"
                 FROM artifacts WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listArtifactsByAnalysis(analysisId: string, organizationId?: string): Promise<ArtifactRecord[]> {
    let query = `SELECT id, organization_id as "organizationId", analysis_id as "analysisId", artifact_type as "artifactType",
                        storage_path as "storagePath", file_name as "fileName", mime_type as "mimeType",
                        file_size_bytes as "fileSizeBytes", created_at as "createdAt"
                 FROM artifacts WHERE analysis_id = $1`;
    const params: any[] = [analysisId];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    query += ` ORDER BY created_at ASC`;
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  // Schedules (Milestone 12)
  async createSchedule(schedule: Omit<ScheduleRecord, 'createdAt' | 'updatedAt'>): Promise<ScheduleRecord> {
    const res = await this.pool.query(
      `INSERT INTO schedules (id, organization_id, created_by_user_id, dataset_id, name, user_query,
                              schedule_type, cron_expression, timezone, one_time_run_at, next_run_at, last_run_at,
                              concurrency_limit, is_enabled, delivery_destination_id, bi_connection_id, export_format, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id, organization_id as "organizationId", created_by_user_id as "createdByUserId", dataset_id as "datasetId",
                 name, user_query as "userQuery", schedule_type as "scheduleType", cron_expression as "cronExpression",
                 timezone, one_time_run_at as "oneTimeRunAt", next_run_at as "nextRunAt", last_run_at as "lastRunAt",
                 concurrency_limit as "concurrencyLimit", is_enabled as "isEnabled", delivery_destination_id as "deliveryDestinationId",
                 bi_connection_id as "biConnectionId", export_format as "exportFormat", status,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        schedule.id,
        schedule.organizationId,
        schedule.createdByUserId,
        schedule.datasetId,
        schedule.name,
        schedule.userQuery,
        schedule.scheduleType,
        schedule.cronExpression,
        schedule.timezone,
        schedule.oneTimeRunAt,
        schedule.nextRunAt,
        schedule.lastRunAt,
        schedule.concurrencyLimit,
        schedule.isEnabled,
        schedule.deliveryDestinationId,
        schedule.biConnectionId,
        schedule.exportFormat,
        schedule.status,
      ]
    );
    return res.rows[0];
  }

  async getScheduleById(id: string, organizationId?: string): Promise<ScheduleRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", created_by_user_id as "createdByUserId", dataset_id as "datasetId",
                        name, user_query as "userQuery", schedule_type as "scheduleType", cron_expression as "cronExpression",
                        timezone, one_time_run_at as "oneTimeRunAt", next_run_at as "nextRunAt", last_run_at as "lastRunAt",
                        concurrency_limit as "concurrencyLimit", is_enabled as "isEnabled", delivery_destination_id as "deliveryDestinationId",
                        bi_connection_id as "biConnectionId", export_format as "exportFormat", status,
                        created_at as "createdAt", updated_at as "updatedAt"
                 FROM schedules WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listSchedulesByOrg(organizationId: string): Promise<ScheduleRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", created_by_user_id as "createdByUserId", dataset_id as "datasetId",
              name, user_query as "userQuery", schedule_type as "scheduleType", cron_expression as "cronExpression",
              timezone, one_time_run_at as "oneTimeRunAt", next_run_at as "nextRunAt", last_run_at as "lastRunAt",
              concurrency_limit as "concurrencyLimit", is_enabled as "isEnabled", delivery_destination_id as "deliveryDestinationId",
              bi_connection_id as "biConnectionId", export_format as "exportFormat", status,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM schedules WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async listDueSchedules(nowIso: string): Promise<ScheduleRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", created_by_user_id as "createdByUserId", dataset_id as "datasetId",
              name, user_query as "userQuery", schedule_type as "scheduleType", cron_expression as "cronExpression",
              timezone, one_time_run_at as "oneTimeRunAt", next_run_at as "nextRunAt", last_run_at as "lastRunAt",
              concurrency_limit as "concurrencyLimit", is_enabled as "isEnabled", delivery_destination_id as "deliveryDestinationId",
              bi_connection_id as "biConnectionId", export_format as "exportFormat", status,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM schedules
       WHERE is_enabled = true AND status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= $1
       ORDER BY next_run_at ASC`,
      [nowIso]
    );
    return res.rows;
  }

  async updateSchedule(id: string, updates: Partial<ScheduleRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE schedules SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async deleteSchedule(id: string, organizationId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM schedules WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Schedule Runs (Milestone 12)
  async createScheduleRun(run: Omit<ScheduleRunRecord, 'createdAt'>): Promise<ScheduleRunRecord> {
    const res = await this.pool.query(
      `INSERT INTO schedule_runs (id, schedule_id, organization_id, analysis_id, scheduled_for, started_at,
                                 completed_at, status, error_message, delivery_status, delivery_details_json,
                                 bi_export_status, bi_export_details_json, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, schedule_id as "scheduleId", organization_id as "organizationId", analysis_id as "analysisId",
                 scheduled_for as "scheduledFor", started_at as "startedAt", completed_at as "completedAt",
                 status, error_message as "errorMessage", delivery_status as "deliveryStatus",
                 delivery_details_json as "deliveryDetailsJson", bi_export_status as "biExportStatus",
                 bi_export_details_json as "biExportDetailsJson", retry_count as "retryCount",
                 created_at as "createdAt"`,
      [
        run.id,
        run.scheduleId,
        run.organizationId,
        run.analysisId,
        run.scheduledFor,
        run.startedAt,
        run.completedAt,
        run.status,
        run.errorMessage,
        run.deliveryStatus,
        run.deliveryDetailsJson,
        run.biExportStatus,
        run.biExportDetailsJson,
        run.retryCount,
      ]
    );
    return res.rows[0];
  }

  async getScheduleRunById(id: string, organizationId?: string): Promise<ScheduleRunRecord | null> {
    let query = `SELECT id, schedule_id as "scheduleId", organization_id as "organizationId", analysis_id as "analysisId",
                        scheduled_for as "scheduledFor", started_at as "startedAt", completed_at as "completedAt",
                        status, error_message as "errorMessage", delivery_status as "deliveryStatus",
                        delivery_details_json as "deliveryDetailsJson", bi_export_status as "biExportStatus",
                        bi_export_details_json as "biExportDetailsJson", retry_count as "retryCount",
                        created_at as "createdAt"
                 FROM schedule_runs WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listScheduleRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]> {
    const res = await this.pool.query(
      `SELECT id, schedule_id as "scheduleId", organization_id as "organizationId", analysis_id as "analysisId",
              scheduled_for as "scheduledFor", started_at as "startedAt", completed_at as "completedAt",
              status, error_message as "errorMessage", delivery_status as "deliveryStatus",
              delivery_details_json as "deliveryDetailsJson", bi_export_status as "biExportStatus",
              bi_export_details_json as "biExportDetailsJson", retry_count as "retryCount",
              created_at as "createdAt"
       FROM schedule_runs WHERE schedule_id = $1 AND organization_id = $2 ORDER BY started_at DESC`,
      [scheduleId, organizationId]
    );
    return res.rows;
  }

  async updateScheduleRun(id: string, updates: Partial<ScheduleRunRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    values.push(id);

    await this.pool.query(
      `UPDATE schedule_runs SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async getActiveRunCount(scheduleId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM schedule_runs WHERE schedule_id = $1 AND status = 'running'`,
      [scheduleId]
    );
    return res.rows[0]?.count || 0;
  }

  // Delivery Destinations (Milestone 12)
  async createDeliveryDestination(dest: Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>): Promise<DeliveryDestinationRecord> {
    const res = await this.pool.query(
      `INSERT INTO delivery_destinations (id, organization_id, name, destination_type, recipient_emails, webhook_url, encrypted_secret, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id as "organizationId", name, destination_type as "destinationType",
                 recipient_emails as "recipientEmails", webhook_url as "webhookUrl", encrypted_secret as "encryptedSecret",
                 is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      [
        dest.id,
        dest.organizationId,
        dest.name,
        dest.destinationType,
        dest.recipientEmails,
        dest.webhookUrl,
        dest.encryptedSecret,
        dest.isActive,
      ]
    );
    return res.rows[0];
  }

  async getDeliveryDestinationById(id: string, organizationId?: string): Promise<DeliveryDestinationRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", name, destination_type as "destinationType",
                        recipient_emails as "recipientEmails", webhook_url as "webhookUrl", encrypted_secret as "encryptedSecret",
                        is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
                 FROM delivery_destinations WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listDeliveryDestinationsByOrg(organizationId: string): Promise<DeliveryDestinationRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", name, destination_type as "destinationType",
              recipient_emails as "recipientEmails", webhook_url as "webhookUrl", encrypted_secret as "encryptedSecret",
              is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM delivery_destinations WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async updateDeliveryDestination(id: string, updates: Partial<DeliveryDestinationRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE delivery_destinations SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async deleteDeliveryDestination(id: string, organizationId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM delivery_destinations WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // BI Platform Connections (Milestone 12)
  async createBiConnection(conn: Omit<BiConnectionRecord, 'createdAt' | 'updatedAt'>): Promise<BiConnectionRecord> {
    const res = await this.pool.query(
      `INSERT INTO bi_connections (id, organization_id, name, platform_type, host_url, encrypted_credentials, status, last_tested_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, organization_id as "organizationId", name, platform_type as "platformType",
                 host_url as "hostUrl", encrypted_credentials as "encryptedCredentials", status,
                 last_tested_at as "lastTestedAt", last_error as "lastError",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        conn.id,
        conn.organizationId,
        conn.name,
        conn.platformType,
        conn.hostUrl,
        conn.encryptedCredentials,
        conn.status,
        conn.lastTestedAt,
        conn.lastError,
      ]
    );
    return res.rows[0];
  }

  async getBiConnectionById(id: string, organizationId?: string): Promise<BiConnectionRecord | null> {
    let query = `SELECT id, organization_id as "organizationId", name, platform_type as "platformType",
                        host_url as "hostUrl", encrypted_credentials as "encryptedCredentials", status,
                        last_tested_at as "lastTestedAt", last_error as "lastError",
                        created_at as "createdAt", updated_at as "updatedAt"
                 FROM bi_connections WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }
    const res = await this.pool.query(query, params);
    return res.rows[0] || null;
  }

  async listBiConnectionsByOrg(organizationId: string): Promise<BiConnectionRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", name, platform_type as "platformType",
              host_url as "hostUrl", encrypted_credentials as "encryptedCredentials", status,
              last_tested_at as "lastTestedAt", last_error as "lastError",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM bi_connections WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async updateBiConnection(id: string, updates: Partial<BiConnectionRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snake} = $${idx++}`);
      values.push(val);
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE bi_connections SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async deleteBiConnection(id: string, organizationId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM bi_connections WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Audit Logs (Milestone 12)
  async createAuditLog(log: Omit<AuditLogRecord, 'createdAt'>): Promise<AuditLogRecord> {
    const res = await this.pool.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, resource_type, resource_id, details_json, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id as "organizationId", user_id as "userId", action,
                 resource_type as "resourceType", resource_id as "resourceId", details_json as "detailsJson",
                 ip_address as "ipAddress", created_at as "createdAt"`,
      [
        log.id,
        log.organizationId,
        log.userId,
        log.action,
        log.resourceType,
        log.resourceId,
        log.detailsJson,
        log.ipAddress,
      ]
    );
    return res.rows[0];
  }

  async listAuditLogsByOrg(organizationId: string, limit = 100): Promise<AuditLogRecord[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", action,
              resource_type as "resourceType", resource_id as "resourceId", details_json as "detailsJson",
              ip_address as "ipAddress", created_at as "createdAt"
       FROM audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    return res.rows;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, message: 'PostgreSQL database operational' };
    } catch (err: any) {
      return { ok: false, message: `PostgreSQL connection error: ${err.message}` };
    }
  }
}

let activeAdapter: DatabaseAdapter | null = null;

/**
 * Sanitizes connection strings to prevent logging passwords in error messages.
 */
export function sanitizeConnectionString(connStr?: string): string {
  if (!connStr) return 'unknown';
  try {
    const u = new URL(connStr);
    if (u.password) {
      u.password = '***';
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return connStr.replace(/:\/\/([^:]+):.*@/, '://$1:***@');
  }
}

export function getDatabaseAdapter(forceMemory = false): DatabaseAdapter {
  if (activeAdapter) return activeAdapter;

  const isProduction = process.env.NODE_ENV === 'production';
  const dbUrl = process.env.DATABASE_URL;

  if (isProduction) {
    if (forceMemory) {
      throw new Error(
        'Configuration Error: In-memory database adapter (MemoryDbAdapter) is prohibited in production mode. A persistent PostgreSQL DATABASE_URL is mandatory.'
      );
    }
    if (!dbUrl) {
      throw new Error(
        'Configuration Error: Missing DATABASE_URL. In production mode, PostgreSQL is mandatory for durable application records.'
      );
    }
    activeAdapter = new PostgresAdapter(dbUrl);
    return activeAdapter;
  }

  // Development and test environments
  if (!forceMemory && dbUrl && process.env.NODE_ENV !== 'test') {
    activeAdapter = new PostgresAdapter(dbUrl);
  } else {
    activeAdapter = new MemoryDbAdapter();
  }
  return activeAdapter;
}

export function setDatabaseAdapter(adapter: DatabaseAdapter | null): void {
  activeAdapter = adapter;
}
