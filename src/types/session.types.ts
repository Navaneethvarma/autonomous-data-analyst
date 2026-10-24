/**
 * Session domain and persistence types.
 */

export interface SessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  csrfToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateSessionInput {
  id?: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  csrfToken: string;
  expiresAt: string;
}
