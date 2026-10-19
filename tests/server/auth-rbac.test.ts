import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter } from '../../src/lib/db/adapter.js';
import { AuthService } from '../../src/lib/auth/service.js';
import {
  hasPermission,
  assertPermission,
  assertTenantScope,
  CrossTenantAccessError,
  AuthorizationError,
} from '../../src/lib/auth/rbac.js';

describe('Authentication, RBAC & Tenant Isolation (Milestone 11)', () => {
  let db: MemoryDbAdapter;
  let authService: AuthService;

  beforeEach(() => {
    db = new MemoryDbAdapter();
    authService = new AuthService(db);
  });

  it('registers a user with hashed password and creates default organization with admin role', async () => {
    const res = await authService.register({
      email: 'founder@acme.corp',
      password: 'SecurePassword123!',
      name: 'Alice Founder',
      organizationName: 'Acme Corp',
    });

    expect(res.user.email).toBe('founder@acme.corp');
    expect(res.user.name).toBe('Alice Founder');
    expect(res.organization.name).toBe('Acme Corp');
    expect(res.token).toHaveLength(64);
    expect(res.csrfToken).toHaveLength(64);

    // Verify stored user password hash is not plaintext
    const stored = await db.getUserByEmail('founder@acme.corp');
    expect(stored?.passwordHash).not.toBe('SecurePassword123!');
    expect(stored?.salt).toBeDefined();

    // Verify membership role is admin
    const membership = await db.getMembership(res.organization.id, res.user.id);
    expect(membership?.role).toBe('admin');
  });

  it('rejects registration with duplicate email address', async () => {
    await authService.register({
      email: 'duplicate@acme.corp',
      password: 'Pass123!Password',
      name: 'User 1',
    });

    await expect(
      authService.register({
        email: 'duplicate@acme.corp',
        password: 'Pass123!Password',
        name: 'User 2',
      })
    ).rejects.toThrow('already exists');
  });

  it('authenticates valid credentials and rejects incorrect passwords', async () => {
    await authService.register({
      email: 'analyst@acme.corp',
      password: 'CorrectPassword123!',
      name: 'Bob Analyst',
    });

    // Valid login
    const loginRes = await authService.login({
      email: 'analyst@acme.corp',
      password: 'CorrectPassword123!',
    });
    expect(loginRes.user.email).toBe('analyst@acme.corp');
    expect(loginRes.token).toBeDefined();

    // Invalid login
    await expect(
      authService.login({
        email: 'analyst@acme.corp',
        password: 'WrongPassword!',
      })
    ).rejects.toThrow('Invalid email or password');
  });

  it('verifies active session tokens and extracts authenticated context', async () => {
    const reg = await authService.register({
      email: 'member@acme.corp',
      password: 'Password123!',
      name: 'Carol Member',
    });

    const authContext = await authService.authenticateToken(reg.token);
    expect(authContext.user.id).toBe(reg.user.id);
    expect(authContext.organization.id).toBe(reg.organization.id);
    expect(authContext.role).toBe('admin');
    expect(authContext.csrfToken).toBe(reg.csrfToken);

    // Invalidate via logout
    await authService.logout(reg.token);
    await expect(authService.authenticateToken(reg.token)).rejects.toThrow(
      'Invalid or expired session'
    );
  });

  it('enforces RBAC permission matrix for Admin, Analyst, and Viewer roles', () => {
    // Admin permissions
    expect(hasPermission('admin', 'dataset:upload')).toBe(true);
    expect(hasPermission('admin', 'analysis:create')).toBe(true);
    expect(hasPermission('admin', 'org:manage_members')).toBe(true);

    // Analyst permissions
    expect(hasPermission('analyst', 'dataset:upload')).toBe(true);
    expect(hasPermission('analyst', 'analysis:create')).toBe(true);
    expect(hasPermission('analyst', 'org:manage_members')).toBe(false);

    // Viewer permissions
    expect(hasPermission('viewer', 'dataset:read')).toBe(true);
    expect(hasPermission('viewer', 'analysis:read')).toBe(true);
    expect(hasPermission('viewer', 'dataset:upload')).toBe(false);
    expect(hasPermission('viewer', 'analysis:create')).toBe(false);

    // Assertion checks
    expect(() => assertPermission('viewer', 'analysis:create')).toThrow(AuthorizationError);
    expect(() => assertPermission('analyst', 'analysis:create')).not.toThrow();
  });

  it('rejects cross-tenant access attempts (IDOR defense)', () => {
    const tenantA = 'org-tenant-alpha-123';
    const tenantB = 'org-tenant-beta-456';

    // Same tenant succeeds
    expect(() => assertTenantScope(tenantA, tenantA, 'Dataset')).not.toThrow();

    // Cross-tenant access is rejected with CrossTenantAccessError
    expect(() => assertTenantScope(tenantA, tenantB, 'Dataset')).toThrow(CrossTenantAccessError);
    expect(() => assertTenantScope(tenantA, tenantB, 'Analysis Job')).toThrow(
      /Cross-tenant access violation/
    );
  });

  it('rejects expired sessions and cleans up expired token', async () => {
    const reg = await authService.register({
      email: 'expired@acme.corp',
      password: 'Password123!',
      name: 'Expired User',
    });

    // Manually backdate session expiration
    const tokenHash = (await import('../../src/lib/auth/service.js')).hashToken(reg.token);
    const session = await db.getSessionByTokenHash(tokenHash);
    expect(session).toBeDefined();

    // Expire session
    session!.expiresAt = new Date(Date.now() - 1000).toISOString();

    await expect(authService.authenticateToken(reg.token)).rejects.toThrow(
      /Invalid or expired session/
    );

    // Verify session was deleted
    const deleted = await db.getSessionByTokenHash(tokenHash);
    expect(deleted).toBeNull();
  });

  it('revokes all sessions on demand via revokeAllUserSessions', async () => {
    const reg = await authService.register({
      email: 'revocation@acme.corp',
      password: 'Password123!',
      name: 'Revocation User',
    });

    const context1 = await authService.authenticateToken(reg.token);
    expect(context1.user.id).toBe(reg.user.id);

    // Revoke all sessions for this user
    await authService.revokeAllUserSessions(reg.user.id);

    await expect(authService.authenticateToken(reg.token)).rejects.toThrow(
      'Invalid or expired session'
    );
  });

  it('rotates session tokens on subsequent logins', async () => {
    const reg = await authService.register({
      email: 'rotation@acme.corp',
      password: 'Password123!',
      name: 'Rotation User',
    });

    const loginRes = await authService.login({
      email: 'rotation@acme.corp',
      password: 'Password123!',
    });

    // Login token should be newly generated
    expect(loginRes.token).not.toBe(reg.token);
    expect(loginRes.csrfToken).not.toBe(reg.csrfToken);
  });
});
