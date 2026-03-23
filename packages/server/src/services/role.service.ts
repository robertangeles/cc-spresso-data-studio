import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import type { CreateRoleDTO, UpdateRoleDTO } from '@cc/shared';

export async function listRoles() {
  return db.query.roles.findMany({
    orderBy: schema.roles.name,
  });
}

export async function getRoleById(id: string) {
  const role = await db.query.roles.findFirst({
    where: eq(schema.roles.id, id),
  });
  if (!role) throw new NotFoundError('Role');
  return role;
}

export async function createRole(data: CreateRoleDTO) {
  const existing = await db.query.roles.findFirst({
    where: eq(schema.roles.name, data.name),
  });
  if (existing) throw new ConflictError(`Role "${data.name}" already exists`);

  const [role] = await db
    .insert(schema.roles)
    .values({
      name: data.name,
      description: data.description ?? null,
      permissions: data.permissions ?? [],
      isSystem: false,
    })
    .returning();

  return role;
}

export async function updateRole(id: string, data: UpdateRoleDTO) {
  const role = await getRoleById(id);

  if (role.isSystem && data.name && data.name !== role.name) {
    throw new ForbiddenError('Cannot rename system roles');
  }

  if (data.name && data.name !== role.name) {
    const existing = await db.query.roles.findFirst({
      where: eq(schema.roles.name, data.name),
    });
    if (existing) throw new ConflictError(`Role "${data.name}" already exists`);
  }

  const [updated] = await db
    .update(schema.roles)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.permissions !== undefined && { permissions: data.permissions }),
      updatedAt: new Date(),
    })
    .where(eq(schema.roles.id, id))
    .returning();

  return updated;
}

export async function deleteRole(id: string) {
  const role = await getRoleById(id);

  if (role.isSystem) {
    throw new ForbiddenError('Cannot delete system roles');
  }

  await db.delete(schema.roles).where(eq(schema.roles.id, id));
  return { success: true };
}
