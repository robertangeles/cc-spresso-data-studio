import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dataModels, organisationMembers, projects } from '../db/schema.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/**
 * Model Studio authorisation helpers.
 *
 * Access rule:
 *   A user may access a Model Studio model iff they are:
 *     (a) the model's owner (data_models.owner_id === userId), OR
 *     (b) an active member of the organisation that owns the model's
 *         project (organisation_members row joined via projects).
 *
 * Security design:
 *   When access is denied (or the model / project does not exist), we
 *   throw NotFoundError — NOT ForbiddenError. Leaking 403 vs 404 lets
 *   attackers enumerate IDs. 404 for everything hides existence.
 *
 * Step 2 does not differentiate viewer vs. editor vs. admin — every
 * authorised user can read and mutate their org's models. Fine-grained
 * role gating (e.g. only org admins can delete) is a Phase-2 follow-up.
 */

export type AccessibleDataModel = typeof dataModels.$inferSelect;

/** Throws NotFoundError if the user cannot access the model. */
export async function assertCanAccessModel(
  userId: string,
  modelId: string,
): Promise<AccessibleDataModel> {
  const [row] = await db
    .select({ model: dataModels, membership: organisationMembers.id })
    .from(dataModels)
    .innerJoin(projects, eq(projects.id, dataModels.projectId))
    .leftJoin(
      organisationMembers,
      and(
        eq(organisationMembers.organisationId, projects.organisationId),
        eq(organisationMembers.userId, userId),
      ),
    )
    .where(
      and(
        eq(dataModels.id, modelId),
        or(eq(dataModels.ownerId, userId), eq(organisationMembers.userId, userId)),
      ),
    )
    .limit(1);

  if (!row || !row.model) {
    logger.info(
      { userId, modelId },
      'Model Studio access denied — row missing or user not member/owner',
    );
    throw new NotFoundError('Model');
  }
  return row.model;
}

/** Convenience: boolean form, no throw. */
export async function canAccessModel(userId: string, modelId: string): Promise<boolean> {
  try {
    await assertCanAccessModel(userId, modelId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts the user can create a model inside the given project.
 * Rule: the user must be an active member of the project's organisation.
 *
 * Returns the project row so the caller can inspect its organisationId
 * without issuing a second query.
 */
export async function assertCanCreateInProject(
  userId: string,
  projectId: string,
): Promise<{ id: string; organisationId: string | null }> {
  const [row] = await db
    .select({
      projectId: projects.id,
      organisationId: projects.organisationId,
      membership: organisationMembers.id,
    })
    .from(projects)
    .leftJoin(
      organisationMembers,
      and(
        eq(organisationMembers.organisationId, projects.organisationId),
        eq(organisationMembers.userId, userId),
      ),
    )
    .where(and(eq(projects.id, projectId), eq(organisationMembers.userId, userId)))
    .limit(1);

  if (!row) {
    logger.info(
      { userId, projectId },
      'Model Studio create denied — project missing or user not org member',
    );
    throw new NotFoundError('Project');
  }
  return { id: row.projectId, organisationId: row.organisationId };
}
