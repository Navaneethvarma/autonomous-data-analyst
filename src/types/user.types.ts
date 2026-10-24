/**
 * User and membership domain and persistence types.
 */

export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  id?: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
}

export interface UpdateUserInput {
  name?: string;
  passwordHash?: string;
  salt?: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  createdAt: string;
}

export interface CreateMembershipInput {
  id?: string;
  organizationId: string;
  userId: string;
  role: UserRole;
}
