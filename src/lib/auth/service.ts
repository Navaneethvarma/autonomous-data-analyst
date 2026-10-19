import crypto from 'node:crypto';
import util from 'node:util';
import { DatabaseAdapter } from '../db/adapter.js';
import { UserRecord, OrganizationRecord, UserRole } from '../db/types.js';
import { AuthenticationRequiredError, AuthorizationError } from './rbac.js';

const scryptAsync = util.promisify(crypto.scrypt);

export interface AuthenticatedContext {
  user: UserRecord;
  organization: OrganizationRecord;
  role: UserRole;
  csrfToken: string;
  sessionId: string;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(hash, 'hex');
    if (derivedKey.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Registers a new user and sets up their initial organization with admin role.
   */
  async register(params: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }): Promise<{ user: UserRecord; organization: OrganizationRecord; token: string; csrfToken: string }> {
    const existing = await this.db.getUserByEmail(params.email);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const { hash, salt } = await hashPassword(params.password);
    const userId = crypto.randomUUID();
    const user = await this.db.createUser({
      id: userId,
      email: params.email.toLowerCase().trim(),
      name: params.name.trim(),
      passwordHash: hash,
      salt,
    });

    const orgId = crypto.randomUUID();
    const orgName = params.organizationName || `${params.name.trim()}'s Workspace`;
    const orgSlug = `${orgName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${orgId.slice(0, 6)}`;
    const organization = await this.db.createOrganization({
      id: orgId,
      name: orgName,
      slug: orgSlug,
    });

    await this.db.createMembership({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      role: 'admin',
    });

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const csrfToken = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.createSession({
      id: crypto.randomUUID(),
      tokenHash,
      userId,
      organizationId: orgId,
      csrfToken,
      expiresAt,
    });

    return { user, organization, token: rawToken, csrfToken };
  }

  /**
   * Authenticates user credentials and generates a secure session.
   */
  async login(params: {
    email: string;
    password: string;
    organizationId?: string;
  }): Promise<{ user: UserRecord; organization: OrganizationRecord; role: UserRole; token: string; csrfToken: string }> {
    const user = await this.db.getUserByEmail(params.email);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isValid = await verifyPassword(params.password, user.passwordHash, user.salt);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    const memberships = await this.db.getMembershipsByUser(user.id);
    if (memberships.length === 0) {
      throw new AuthorizationError('User has no active organization memberships.');
    }

    // Resolve target organization
    let membership = memberships[0];
    if (params.organizationId) {
      const match = memberships.find(m => m.organizationId === params.organizationId);
      if (!match) {
        throw new AuthorizationError('User is not a member of the requested organization.');
      }
      membership = match;
    }

    if (!membership) {
      throw new AuthorizationError('User has no active organization memberships.');
    }

    const organization = await this.db.getOrganizationById(membership.organizationId);
    if (!organization) {
      throw new Error('Active organization not found.');
    }

    // Rotate session: generate a fresh token pair on login
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const csrfToken = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.createSession({
      id: crypto.randomUUID(),
      tokenHash,
      userId: user.id,
      organizationId: organization.id,
      csrfToken,
      expiresAt,
    });

    return {
      user,
      organization,
      role: membership.role,
      token: rawToken,
      csrfToken,
    };
  }

  /**
   * Resolves and verifies an active session token, returning authenticated context.
   * Checks expiration and rejects expired or revoked sessions.
   */
  async authenticateToken(rawToken: string): Promise<AuthenticatedContext> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AuthenticationRequiredError('Missing or invalid session token.');
    }

    const tokenHash = hashToken(rawToken);
    const session = await this.db.getSessionByTokenHash(tokenHash);
    if (!session) {
      throw new AuthenticationRequiredError('Invalid or expired session.');
    }

    // Verify session expiration
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.db.deleteSession(tokenHash);
      throw new AuthenticationRequiredError('Session has expired. Please log in again.');
    }

    const user = await this.db.getUserById(session.userId);
    if (!user) {
      throw new AuthenticationRequiredError('User account associated with session does not exist.');
    }

    const organization = await this.db.getOrganizationById(session.organizationId);
    if (!organization) {
      throw new AuthenticationRequiredError('Organization associated with session does not exist.');
    }

    const membership = await this.db.getMembership(organization.id, user.id);
    if (!membership) {
      throw new AuthorizationError('User is no longer a member of this organization.');
    }

    return {
      user,
      organization,
      role: membership.role,
      csrfToken: session.csrfToken,
      sessionId: session.id,
    };
  }

  /**
   * Logs out the session by invalidating the token.
   */
  async logout(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    await this.db.deleteSession(tokenHash);
  }

  /**
   * Revokes all active sessions for a user (e.g. after password reset or privilege changes).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.db.deleteUserSessions(userId);
  }

  /**
   * Adds or invites a user to an organization with a specific role.
   */
  async addMember(adminContext: AuthenticatedContext, email: string, role: UserRole): Promise<void> {
    if (adminContext.role !== 'admin') {
      throw new AuthorizationError('Only organization admins can add or modify members.');
    }

    const targetUser = await this.db.getUserByEmail(email);
    if (!targetUser) {
      throw new Error(`User with email '${email}' was not found. They must register first.`);
    }

    const existingMembership = await this.db.getMembership(adminContext.organization.id, targetUser.id);
    if (existingMembership) {
      await this.db.updateMembershipRole(adminContext.organization.id, targetUser.id, role);
    } else {
      await this.db.createMembership({
        id: crypto.randomUUID(),
        organizationId: adminContext.organization.id,
        userId: targetUser.id,
        role,
      });
    }
  }
}
