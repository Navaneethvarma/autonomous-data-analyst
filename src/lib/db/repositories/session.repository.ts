import { BaseRepository } from './base.repository.js';
import type { SessionRecord } from '../types.js';

export interface ISessionRepository {
  create(session: Omit<SessionRecord, 'createdAt'>): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}

export class SessionRepository extends BaseRepository implements ISessionRepository {
  async create(session: Omit<SessionRecord, 'createdAt'>): Promise<SessionRecord> {
    return this.db.createSession(session);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.db.getSessionByTokenHash(tokenHash);
  }

  async delete(tokenHash: string): Promise<void> {
    return this.db.deleteSession(tokenHash);
  }

  async deleteForUser(userId: string): Promise<void> {
    return this.db.deleteUserSessions(userId);
  }
}
