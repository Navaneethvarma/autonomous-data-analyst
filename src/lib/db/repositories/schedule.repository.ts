import { BaseRepository } from './base.repository.js';
import type { ScheduleRecord, ScheduleRunRecord } from '../types.js';

export interface IScheduleRepository {
  findById(id: string, organizationId?: string): Promise<ScheduleRecord | null>;
  listForOrganization(organizationId: string): Promise<ScheduleRecord[]>;
  listDue(nowIso: string): Promise<ScheduleRecord[]>;
  create(schedule: Omit<ScheduleRecord, 'createdAt' | 'updatedAt'>): Promise<ScheduleRecord>;
  update(id: string, updates: Partial<ScheduleRecord>): Promise<void>;
  delete(id: string, organizationId: string): Promise<boolean>;

  createRun(run: Omit<ScheduleRunRecord, 'createdAt'>): Promise<ScheduleRunRecord>;
  getRunById(id: string, organizationId?: string): Promise<ScheduleRunRecord | null>;
  listRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]>;
  updateRun(id: string, updates: Partial<ScheduleRunRecord>): Promise<void>;
  getActiveRunCount(scheduleId: string): Promise<number>;
}

export class ScheduleRepository extends BaseRepository implements IScheduleRepository {
  async findById(id: string, organizationId?: string): Promise<ScheduleRecord | null> {
    return this.db.getScheduleById(id, organizationId);
  }

  async listForOrganization(organizationId: string): Promise<ScheduleRecord[]> {
    return this.db.listSchedulesByOrg(organizationId);
  }

  async listDue(nowIso: string): Promise<ScheduleRecord[]> {
    return this.db.listDueSchedules(nowIso);
  }

  async create(schedule: Omit<ScheduleRecord, 'createdAt' | 'updatedAt'>): Promise<ScheduleRecord> {
    return this.db.createSchedule(schedule);
  }

  async update(id: string, updates: Partial<ScheduleRecord>): Promise<void> {
    return this.db.updateSchedule(id, updates);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return this.db.deleteSchedule(id, organizationId);
  }

  async createRun(run: Omit<ScheduleRunRecord, 'createdAt'>): Promise<ScheduleRunRecord> {
    return this.db.createScheduleRun(run);
  }

  async getRunById(id: string, organizationId?: string): Promise<ScheduleRunRecord | null> {
    return this.db.getScheduleRunById(id, organizationId);
  }

  async listRuns(scheduleId: string, organizationId: string): Promise<ScheduleRunRecord[]> {
    return this.db.listScheduleRuns(scheduleId, organizationId);
  }

  async updateRun(id: string, updates: Partial<ScheduleRunRecord>): Promise<void> {
    return this.db.updateScheduleRun(id, updates);
  }

  async getActiveRunCount(scheduleId: string): Promise<number> {
    return this.db.getActiveRunCount(scheduleId);
  }
}
