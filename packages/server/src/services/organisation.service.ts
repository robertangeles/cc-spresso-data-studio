import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { CreateOrganisationDTO, UpdateOrganisationDTO, OrgRole } from '@cc/shared';

const VALID_ROLES: OrgRole[] = ['owner', 'admin', 'member'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateJoinKey(): string {
  return crypto.randomBytes(10).toString('hex'); // 20 char hex
}

async function generateSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // Check uniqueness; append random suffix on collision
  const existing = await db
    .select({ slug: schema.organisations.slug })
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, base));

  if (existing.length === 0) return base;

  const suffix = crypto.randomBytes(2).toString('hex'); // 4 chars
  return `${base}-${suffix}`;
}

async function verifyMembership(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!member) throw new ForbiddenError('You are not a member of this organisation.');
  return member;
}

async function verifyAdminAccess(orgId: string, userId: string) {
  const member = await verifyMembership(orgId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw new ForbiddenError('Admin or owner access required.');
  }
  return member;
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

export async function listOrganisations(userId: string) {
  // Orgs where this user is a member (any role)
  const rows = await db
    .select({
      id: schema.organisations.id,
      name: schema.organisations.name,
      slug: schema.organisations.slug,
      description: schema.organisations.description,
      logoUrl: schema.organisations.logoUrl,
      joinKey: schema.organisations.joinKey,
      ownerId: schema.organisations.ownerId,
      createdAt: schema.organisations.createdAt,
      updatedAt: schema.organisations.updatedAt,
      memberRole: schema.organisationMembers.role,
    })
    .from(schema.organisationMembers)
    .innerJoin(
      schema.organisations,
      eq(schema.organisationMembers.organisationId, schema.organisations.id),
    )
    .where(eq(schema.organisationMembers.userId, userId));

  return rows;
}

export async function createOrganisation(userId: string, dto: CreateOrganisationDTO) {
  if (!dto.name || dto.name.trim().length === 0) {
    throw new Error('Organisation name is required.');
  }

  const slug = await generateSlug(dto.name.trim());
  const joinKey = generateJoinKey();

  const result = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(schema.organisations)
      .values({
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() ?? null,
        joinKey,
        ownerId: userId,
      })
      .returning();

    await tx.insert(schema.organisationMembers).values({
      organisationId: org.id,
      userId,
      role: 'owner',
    });

    return org;
  });

  return result;
}

export async function getOrganisation(orgId: string, userId: string) {
  // Verify membership (throws ForbiddenError if not a member)
  await verifyMembership(orgId, userId);

  const [org] = await db
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.id, orgId))
    .limit(1);

  if (!org) throw new NotFoundError('Organisation not found.');

  // Fetch members with user details
  const members = await db
    .select({
      id: schema.organisationMembers.id,
      organisationId: schema.organisationMembers.organisationId,
      userId: schema.organisationMembers.userId,
      role: schema.organisationMembers.role,
      joinedAt: schema.organisationMembers.joinedAt,
      userName: schema.users.name,
      userEmail: schema.users.email,
      userAvatar: schema.userProfiles.avatarUrl,
    })
    .from(schema.organisationMembers)
    .innerJoin(schema.users, eq(schema.organisationMembers.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.users.id, schema.userProfiles.userId))
    .where(eq(schema.organisationMembers.organisationId, orgId));

  return { ...org, members };
}

export async function updateOrganisation(
  orgId: string,
  userId: string,
  dto: UpdateOrganisationDTO,
) {
  await verifyAdminAccess(orgId, userId);

  const [org] = await db
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.id, orgId))
    .limit(1);

  if (!org) throw new NotFoundError('Organisation not found.');

  const updates: Partial<typeof schema.organisations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (dto.name !== undefined) updates.name = dto.name.trim();
  if (dto.description !== undefined) updates.description = dto.description.trim() || null;
  if (dto.logoUrl !== undefined) updates.logoUrl = dto.logoUrl.trim() || null;

  const [updated] = await db
    .update(schema.organisations)
    .set(updates)
    .where(eq(schema.organisations.id, orgId))
    .returning();

  return updated;
}

export async function deleteOrganisation(orgId: string, userId: string) {
  const member = await verifyMembership(orgId, userId);
  if (member.role !== 'owner') {
    throw new ForbiddenError('Only the owner can delete an organisation.');
  }

  await db.delete(schema.organisations).where(eq(schema.organisations.id, orgId));
}

export async function joinOrganisation(userId: string, joinKey: string) {
  if (!joinKey || joinKey.trim().length === 0) {
    throw new Error('Join key is required.');
  }

  const [org] = await db
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.joinKey, joinKey.trim()))
    .limit(1);

  if (!org) throw new NotFoundError('Invalid join key — organisation not found.');

  // Check if already a member
  const [existing] = await db
    .select({ id: schema.organisationMembers.id })
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, org.id),
        eq(schema.organisationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) throw new Error('You are already a member of this organisation.');

  const [member] = await db
    .insert(schema.organisationMembers)
    .values({
      organisationId: org.id,
      userId,
      role: 'member',
    })
    .returning();

  return { organisation: org, member };
}

export async function removeMember(orgId: string, requesterId: string, targetUserId: string) {
  await verifyAdminAccess(orgId, requesterId);

  // Cannot remove the owner
  const [target] = await db
    .select()
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!target) throw new NotFoundError('Member not found.');
  if (target.role === 'owner') throw new ForbiddenError('Cannot remove the organisation owner.');

  await db
    .delete(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, targetUserId),
      ),
    );
}

export async function updateMemberRole(
  orgId: string,
  requesterId: string,
  targetUserId: string,
  newRole: OrgRole,
) {
  if (!VALID_ROLES.includes(newRole)) {
    throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  // Only owners can change roles
  const requester = await verifyMembership(orgId, requesterId);
  if (requester.role !== 'owner') {
    throw new ForbiddenError('Only the owner can change member roles.');
  }

  // Cannot demote self (owner)
  if (requesterId === targetUserId) {
    throw new ForbiddenError('Cannot change your own role.');
  }

  const [target] = await db
    .select()
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!target) throw new NotFoundError('Member not found.');
  if (target.role === 'owner') throw new ForbiddenError("Cannot change the owner's role.");

  const [updated] = await db
    .update(schema.organisationMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, targetUserId),
      ),
    )
    .returning();

  return updated;
}

export async function regenerateJoinKey(orgId: string, userId: string) {
  await verifyAdminAccess(orgId, userId);

  const newKey = generateJoinKey();

  const [updated] = await db
    .update(schema.organisations)
    .set({ joinKey: newKey, updatedAt: new Date() })
    .where(eq(schema.organisations.id, orgId))
    .returning();

  if (!updated) throw new NotFoundError('Organisation not found.');

  return updated;
}
