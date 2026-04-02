import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError } from '../utils/errors.js';

interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId: string | null;
  isBlocked: boolean;
  freeSessionsLimit: number;
  freeSessionsUsed: number;
  googleId: string | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { id: string; name: string }[];
}

async function getUserRoles(userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({
      id: schema.roles.id,
      name: schema.roles.name,
    })
    .from(schema.roleUser)
    .innerJoin(schema.roles, eq(schema.roleUser.roleId, schema.roles.id))
    .where(eq(schema.roleUser.userId, userId));

  return rows;
}

export async function listUsers(): Promise<UserWithRoles[]> {
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      roleId: schema.users.roleId,
      isBlocked: schema.users.isBlocked,
      freeSessionsLimit: schema.users.freeSessionsLimit,
      freeSessionsUsed: schema.users.freeSessionsUsed,
      googleId: schema.users.googleId,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt);

  // Fetch roles for all users
  const allRoleAssignments = await db
    .select({
      userId: schema.roleUser.userId,
      roleId: schema.roles.id,
      roleName: schema.roles.name,
    })
    .from(schema.roleUser)
    .innerJoin(schema.roles, eq(schema.roleUser.roleId, schema.roles.id));

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of allRoleAssignments) {
    const existing = rolesByUser.get(row.userId) ?? [];
    existing.push({ id: row.roleId, name: row.roleName });
    rolesByUser.set(row.userId, existing);
  }

  return users.map((u) => ({
    ...u,
    roles: rolesByUser.get(u.id) ?? [],
  }));
}

export async function getUser(id: string): Promise<UserWithRoles> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!user) throw new NotFoundError('User not found');

  const roles = await getUserRoles(id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleId: user.roleId,
    isBlocked: user.isBlocked,
    freeSessionsLimit: user.freeSessionsLimit,
    freeSessionsUsed: user.freeSessionsUsed,
    googleId: user.googleId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles,
  };
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    role?: string;
    roleId?: string | null;
    isBlocked?: boolean;
    freeSessionsLimit?: number;
    freeSessionsUsed?: number;
  },
) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!user) throw new NotFoundError('User not found');

  const [updated] = await db
    .update(schema.users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.users.id, id))
    .returning();

  const roles = await getUserRoles(id);

  return { ...updated, roles };
}

/**
 * Set the full list of roles for a user (replaces existing assignments).
 */
export async function setUserRoles(userId: string, roleIds: string[]) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) throw new NotFoundError('User not found');

  // Remove all existing role assignments
  await db.delete(schema.roleUser).where(eq(schema.roleUser.userId, userId));

  // Insert new assignments
  if (roleIds.length > 0) {
    await db.insert(schema.roleUser).values(roleIds.map((roleId) => ({ userId, roleId })));
  }

  // Update legacy role field with the "highest" role name for backwards compatibility
  if (roleIds.length > 0) {
    const assignedRoles = await getUserRoles(userId);
    // Prefer Administrator > other roles > Subscriber
    const primaryRole =
      assignedRoles.find((r) => r.name === 'Administrator') ??
      assignedRoles.find((r) => r.name !== 'Subscriber') ??
      assignedRoles[0];

    await db
      .update(schema.users)
      .set({ role: primaryRole.name, roleId: primaryRole.id, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  return getUserRoles(userId);
}

export async function blockUser(id: string, blocked: boolean) {
  return updateUser(id, { isBlocked: blocked });
}

export async function deleteUser(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!user) throw new NotFoundError('User not found');

  // Cascade handles role_user and refresh_tokens cleanup
  await db.delete(schema.users).where(eq(schema.users.id, id));
}
