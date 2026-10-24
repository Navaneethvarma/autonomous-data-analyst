/**
 * Authentication and authorization domain contracts and request/response models.
 */

import type { UserRecord, UserRole } from './user.types.js';
import type { OrganizationRecord } from './organization.types.js';

export type { UserRole };

export interface AuthenticatedContext {
  user: UserRecord;
  organization: OrganizationRecord;
  role: UserRole;
  csrfToken: string;
  sessionId: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

export interface RegisterResult {
  user: UserRecord;
  organization: OrganizationRecord;
  token: string;
  csrfToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
  organizationId?: string;
}

export interface LoginResult {
  user: UserRecord;
  organization: OrganizationRecord;
  role: UserRole;
  token: string;
  csrfToken: string;
}

export interface PasswordHashResult {
  hash: string;
  salt: string;
}
