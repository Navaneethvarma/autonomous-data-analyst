import type { UserRole } from '../../types/user.types.js';

export type Permission =
  | 'dataset:read'
  | 'dataset:upload'
  | 'dataset:delete'
  | 'analysis:read'
  | 'analysis:create'
  | 'analysis:cancel'
  | 'artifact:download'
  | 'org:manage_members'
  | 'schedule:read'
  | 'schedule:manage'
  | 'delivery:read'
  | 'delivery:manage'
  | 'bi:read'
  | 'bi:manage';

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  admin: new Set<Permission>([
    'dataset:read',
    'dataset:upload',
    'dataset:delete',
    'analysis:read',
    'analysis:create',
    'analysis:cancel',
    'artifact:download',
    'org:manage_members',
    'schedule:read',
    'schedule:manage',
    'delivery:read',
    'delivery:manage',
    'bi:read',
    'bi:manage',
  ]),
  analyst: new Set<Permission>([
    'dataset:read',
    'dataset:upload',
    'analysis:read',
    'analysis:create',
    'analysis:cancel',
    'artifact:download',
    'schedule:read',
    'schedule:manage',
    'delivery:read',
    'delivery:manage',
    'bi:read',
    'bi:manage',
  ]),
  viewer: new Set<Permission>([
    'dataset:read',
    'analysis:read',
    'artifact:download',
    'schedule:read',
    'delivery:read',
    'bi:read',
  ]),
};

export class AuthorizationError extends Error {
  public statusCode: number;
  constructor(message: string = 'Access denied: insufficient permissions.', statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
  }
}

export class CrossTenantAccessError extends AuthorizationError {
  constructor(message: string = 'Access denied: resource belongs to another tenant.') {
    super(message, 403);
    this.name = 'CrossTenantAccessError';
  }
}

export class AuthenticationRequiredError extends AuthorizationError {
  constructor(message: string = 'Authentication required to access this resource.') {
    super(message, 401);
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Checks whether a user role has the required permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Enforces permission check, throwing AuthorizationError if unauthorized.
 */
export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(
      `Access denied: role '${role}' lacks required permission '${permission}'.`
    );
  }
}

/**
 * Strict tenant boundary assertion.
 * Verifies that the resource organizationId strictly matches the session's active organizationId.
 */
export function assertTenantScope(
  sessionOrgId: string,
  resourceOrgId: string,
  resourceName = 'Resource'
): void {
  if (!sessionOrgId || !resourceOrgId || sessionOrgId !== resourceOrgId) {
    throw new CrossTenantAccessError(
      `Cross-tenant access violation: ${resourceName} does not belong to authorized organization.`
    );
  }
}
