import type { UserRole } from '../../types/user.types.js';

export enum Permission {
  DATASET_READ = 'dataset:read',
  DATASET_UPLOAD = 'dataset:upload',
  DATASET_DELETE = 'dataset:delete',
  ANALYSIS_READ = 'analysis:read',
  ANALYSIS_CREATE = 'analysis:create',
  ANALYSIS_CANCEL = 'analysis:cancel',
  ARTIFACT_DOWNLOAD = 'artifact:download',
  ORG_MANAGE_MEMBERS = 'org:manage_members',
  SCHEDULE_READ = 'schedule:read',
  SCHEDULE_MANAGE = 'schedule:manage',
  DELIVERY_READ = 'delivery:read',
  DELIVERY_MANAGE = 'delivery:manage',
  BI_READ = 'bi:read',
  BI_MANAGE = 'bi:manage',
}

export type PermissionInput = Permission | `${Permission}`;

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission | string>> = {
  admin: new Set<Permission | string>([
    Permission.DATASET_READ,
    Permission.DATASET_UPLOAD,
    Permission.DATASET_DELETE,
    Permission.ANALYSIS_READ,
    Permission.ANALYSIS_CREATE,
    Permission.ANALYSIS_CANCEL,
    Permission.ARTIFACT_DOWNLOAD,
    Permission.ORG_MANAGE_MEMBERS,
    Permission.SCHEDULE_READ,
    Permission.SCHEDULE_MANAGE,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_MANAGE,
    Permission.BI_READ,
    Permission.BI_MANAGE,
  ]),
  analyst: new Set<Permission | string>([
    Permission.DATASET_READ,
    Permission.DATASET_UPLOAD,
    Permission.ANALYSIS_READ,
    Permission.ANALYSIS_CREATE,
    Permission.ANALYSIS_CANCEL,
    Permission.ARTIFACT_DOWNLOAD,
    Permission.SCHEDULE_READ,
    Permission.SCHEDULE_MANAGE,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_MANAGE,
    Permission.BI_READ,
    Permission.BI_MANAGE,
  ]),
  viewer: new Set<Permission | string>([
    Permission.DATASET_READ,
    Permission.ANALYSIS_READ,
    Permission.ARTIFACT_DOWNLOAD,
    Permission.SCHEDULE_READ,
    Permission.DELIVERY_READ,
    Permission.BI_READ,
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
export function hasPermission(role: UserRole, permission: Permission | `${Permission}`): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Enforces permission check, throwing AuthorizationError if unauthorized.
 */
export function assertPermission(role: UserRole, permission: Permission | `${Permission}`): void {
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
