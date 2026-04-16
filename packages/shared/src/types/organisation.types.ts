// ============================================================
// ORGANISATION TYPES
// Shared between client and server — no server-only imports
// ============================================================

export type OrgRole = 'owner' | 'admin' | 'member';

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  joinKey: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationMember {
  id: string;
  organisationId: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  // Joined from users table
  userName: string;
  userEmail: string;
  userAvatar: string | null;
}

export interface OrganisationWithMembers extends Organisation {
  members: OrganisationMember[];
}

export interface CreateOrganisationDTO {
  name: string;
  description?: string;
}

export interface UpdateOrganisationDTO {
  name?: string;
  description?: string;
  logoUrl?: string;
}
