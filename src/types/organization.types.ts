/**
 * Organization domain and persistence types.
 */

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationInput {
  id?: string;
  name: string;
  slug: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
}
