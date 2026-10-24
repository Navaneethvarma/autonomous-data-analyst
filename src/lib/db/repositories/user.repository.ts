import { BaseRepository } from './base.repository.js';
import type { UserRecord, MembershipRecord, UserRole } from '../types.js';

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord>;
  createMembership(mem: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord>;
  getMembership(organizationId: string, userId: string): Promise<MembershipRecord | null>;
  getMembershipsByUser(userId: string): Promise<MembershipRecord[]>;
  updateMembershipRole(organizationId: string, userId: string, role: UserRole): Promise<void>;
}

export class UserRepository extends BaseRepository implements IUserRepository {
  async findById(id: string): Promise<UserRecord | null> {
    return this.db.getUserById(id);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.getUserByEmail(email);
  }

  async create(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    return this.db.createUser(user);
  }

  async createMembership(mem: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord> {
    return this.db.createMembership(mem);
  }

  async getMembership(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    return this.db.getMembership(organizationId, userId);
  }

  async getMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    return this.db.getMembershipsByUser(userId);
  }

  async updateMembershipRole(organizationId: string, userId: string, role: UserRole): Promise<void> {
    return this.db.updateMembershipRole(organizationId, userId, role);
  }
}
