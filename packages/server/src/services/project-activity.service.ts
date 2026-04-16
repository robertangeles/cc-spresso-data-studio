import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface Activity {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Fire-and-forget activity logger.
 * Call without await; catch errors silently so logging never breaks operations.
 */
export async function logActivity(
  projectId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.projectActivities).values({
    projectId,
    userId,
    action,
    entityType,
    entityId: entityId ?? null,
    metadata,
  });
}

/**
 * List activities for a project. Caller must have access to the project.
 */
export async function listActivities(
  projectId: string,
  userId: string,
  options: { limit?: number; offset?: number; entityType?: string } = {},
): Promise<Activity[]> {
  // Access check — user must own the project or be a member
  const access = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .leftJoin(
      schema.projectMembers,
      and(
        eq(schema.projectMembers.projectId, schema.projects.id),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (access.length === 0) throw new NotFoundError('Project');

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
    columns: { userId: true },
  });

  const isMember = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
  });

  if (project?.userId !== userId && !isMember) {
    throw new ForbiddenError('You do not have access to this project');
  }

  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const baseQuery = db
    .select({
      id: schema.projectActivities.id,
      projectId: schema.projectActivities.projectId,
      userId: schema.projectActivities.userId,
      userName: schema.users.name,
      userAvatar: schema.userProfiles.avatarUrl,
      action: schema.projectActivities.action,
      entityType: schema.projectActivities.entityType,
      entityId: schema.projectActivities.entityId,
      metadata: schema.projectActivities.metadata,
      createdAt: schema.projectActivities.createdAt,
    })
    .from(schema.projectActivities)
    .innerJoin(schema.users, eq(schema.projectActivities.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.projectActivities.userId, schema.userProfiles.userId))
    .where(
      options.entityType
        ? and(
            eq(schema.projectActivities.projectId, projectId),
            eq(schema.projectActivities.entityType, options.entityType),
          )
        : eq(schema.projectActivities.projectId, projectId),
    )
    .orderBy(desc(schema.projectActivities.createdAt))
    .limit(limit)
    .offset(offset);

  const rows = await baseQuery;

  return rows.map((r) => ({
    ...r,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

/**
 * List activities scoped to a single card (entityType = 'card', entityId = cardId).
 */
export async function listCardActivities(
  projectId: string,
  userId: string,
  cardId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Activity[]> {
  // Reuse project-level access check
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
    columns: { userId: true },
  });

  if (!project) throw new NotFoundError('Project');

  const isMember = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
  });

  if (project.userId !== userId && !isMember) {
    throw new ForbiddenError('You do not have access to this project');
  }

  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const rows = await db
    .select({
      id: schema.projectActivities.id,
      projectId: schema.projectActivities.projectId,
      userId: schema.projectActivities.userId,
      userName: schema.users.name,
      userAvatar: schema.userProfiles.avatarUrl,
      action: schema.projectActivities.action,
      entityType: schema.projectActivities.entityType,
      entityId: schema.projectActivities.entityId,
      metadata: schema.projectActivities.metadata,
      createdAt: schema.projectActivities.createdAt,
    })
    .from(schema.projectActivities)
    .innerJoin(schema.users, eq(schema.projectActivities.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.projectActivities.userId, schema.userProfiles.userId))
    .where(
      and(
        eq(schema.projectActivities.projectId, projectId),
        eq(schema.projectActivities.entityId, cardId),
      ),
    )
    .orderBy(desc(schema.projectActivities.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}
