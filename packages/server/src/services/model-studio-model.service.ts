import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { ModelCreate, ModelListQuery, ModelUpdate } from '@cc/shared';
import { db } from '../db/index.js';
import {
  clients,
  dataModels,
  organisationMembers,
  organisations,
  projects,
  users,
} from '../db/schema.js';
import { ConflictError, DBError, NotFoundError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel, assertCanCreateInProject } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';

/**
 * Model Studio — data_models CRUD service.
 *
 * Rules enforced here (not in controllers):
 *   - Only org members can create models (assertCanCreateInOrg).
 *   - Only owners + org members can read / update / delete
 *     (assertCanAccessModel — hides existence via NotFoundError).
 *   - Every mutation writes a change_log row. Audit failures are
 *     logged but never fail the mutation.
 *   - Uniqueness (org_id, owner_id, name) is enforced by the
 *     schema unique index; we translate the PG error code to
 *     ConflictError.
 *
 * NB: Step 2 ships read/write for all authorised users. Fine-grained
 * role gating (e.g. only org admins can delete) is a Phase-2 follow-up
 * tracked in the alignment doc's TODO list.
 */

export type DataModel = typeof dataModels.$inferSelect;

/**
 * Hierarchy-enriched projection of a model. The trust principle
 * (DMBOK §11) says every artefact must expose its provenance — who
 * owns it and where it sits. We hydrate the chain once in SQL to
 * avoid N+1s in the list view.
 */
export type DataModelWithContext = DataModel & {
  projectName: string;
  organisationId: string | null;
  organisationName: string | null;
  clientId: string | null;
  clientName: string | null;
  ownerName: string | null;
};

async function withContext(rows: DataModel[]): Promise<DataModelWithContext[]> {
  if (rows.length === 0) return [];
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)));
  const ownerIds = Array.from(new Set(rows.map((r) => r.ownerId)));

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      organisationId: projects.organisationId,
      organisationName: organisations.name,
      clientId: projects.clientId,
      clientName: clients.name,
    })
    .from(projects)
    .leftJoin(organisations, eq(organisations.id, projects.organisationId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(inArray(projects.id, projectIds));
  const projectMap = new Map(projectRows.map((p) => [p.id, p]));

  const ownerRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ownerIds));
  const ownerMap = new Map(ownerRows.map((u) => [u.id, u.name]));

  return rows.map((r) => {
    const p = projectMap.get(r.projectId);
    return {
      ...r,
      projectName: p?.name ?? 'Unknown project',
      organisationId: p?.organisationId ?? null,
      organisationName: p?.organisationName ?? null,
      clientId: p?.clientId ?? null,
      clientName: p?.clientName ?? null,
      ownerName: ownerMap.get(r.ownerId) ?? null,
    };
  });
}

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

// ============================================================
// CREATE
// ============================================================

export async function createModel(userId: string, dto: ModelCreate): Promise<DataModelWithContext> {
  await assertCanCreateInProject(userId, dto.projectId);

  try {
    const [created] = await db
      .insert(dataModels)
      .values({
        projectId: dto.projectId,
        ownerId: userId,
        name: dto.name,
        description: dto.description ?? null,
        activeLayer: dto.activeLayer ?? 'conceptual',
        notation: dto.notation ?? 'ie',
        originDirection: dto.originDirection ?? 'greenfield',
        metadata: dto.metadata ?? {},
        tags: dto.tags ?? [],
      })
      .returning();

    await recordChange({
      dataModelId: created.id,
      objectId: created.id,
      objectType: 'model',
      action: 'create',
      changedBy: userId,
      afterState: created,
    });

    logger.info(
      { userId, modelId: created.id, projectId: dto.projectId },
      'Model Studio: model created',
    );
    const [hydrated] = await withContext([created]);
    return hydrated;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `A model named "${dto.name}" already exists in this project for this owner.`,
      );
    }
    logger.error({ err, userId, projectId: dto.projectId }, 'createModel failed');
    throw new DBError('createModel');
  }
}

// ============================================================
// LIST — all models the user can access
// ============================================================

export async function listModels(
  userId: string,
  query: ModelListQuery,
): Promise<{ models: DataModelWithContext[]; total: number }> {
  // Accessible set: owned by user OR belongs to a project whose org
  // the user is a member of. Computed via two subqueries:
  //   - userOrgIds: all orgs the user is a member of
  //   - visibleProjectIds: projects in those orgs
  const userOrgIds = db
    .select({ organisationId: organisationMembers.organisationId })
    .from(organisationMembers)
    .where(eq(organisationMembers.userId, userId));

  const visibleProjectIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.organisationId, userOrgIds));

  let whereExpr: SQL | undefined = or(
    eq(dataModels.ownerId, userId),
    inArray(dataModels.projectId, visibleProjectIds),
  );
  if (query.projectId) {
    whereExpr = and(whereExpr, eq(dataModels.projectId, query.projectId));
  }
  if (!query.includeArchived) {
    whereExpr = and(whereExpr, isNull(dataModels.archivedAt));
  }

  const rows = await db
    .select()
    .from(dataModels)
    .where(whereExpr)
    .orderBy(desc(dataModels.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dataModels)
    .where(whereExpr);

  const models = await withContext(rows);
  return { models, total: count };
}

// ============================================================
// GET one
// ============================================================

export async function getModel(userId: string, modelId: string): Promise<DataModelWithContext> {
  const row = await assertCanAccessModel(userId, modelId);
  const [hydrated] = await withContext([row]);
  return hydrated;
}

// ============================================================
// UPDATE
// ============================================================

export async function updateModel(
  userId: string,
  modelId: string,
  patch: ModelUpdate,
): Promise<DataModelWithContext> {
  const before = await assertCanAccessModel(userId, modelId);

  try {
    const [updated] = await db
      .update(dataModels)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(dataModels.id, modelId))
      .returning();

    if (!updated) throw new NotFoundError('Model');

    await recordChange({
      dataModelId: modelId,
      objectId: modelId,
      objectType: 'model',
      action: 'update',
      changedBy: userId,
      beforeState: before,
      afterState: updated,
    });

    logger.info({ userId, modelId, fields: Object.keys(patch) }, 'Model Studio: model updated');
    const [hydrated] = await withContext([updated]);
    return hydrated;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    if (isUniqueViolation(err)) {
      throw new ConflictError(`A model with that name already exists in this organisation.`);
    }
    logger.error({ err, userId, modelId }, 'updateModel failed');
    throw new DBError('updateModel');
  }
}

// ============================================================
// DELETE — cascades via schema FKs
// ============================================================

export async function deleteModel(userId: string, modelId: string): Promise<void> {
  const before = await assertCanAccessModel(userId, modelId);

  try {
    const result = await db.delete(dataModels).where(eq(dataModels.id, modelId));
    if (result.rowCount === 0) throw new NotFoundError('Model');

    // Cascade deletion of entities, attributes, relationships, canvas states,
    // semantic mappings, chat logs, embeddings, embedding jobs, change log
    // children is handled by the schema's ON DELETE CASCADE FKs. We still
    // record a top-level change_log row for the model itself so the audit
    // trail captures the delete action and motivating user.
    //
    // NOTE: Because the model's own change_log children are cascade-deleted
    // along with it, this audit row is ephemeral for now. When we add a
    // separate global audit_log table in Phase 2, rewrite this to hit that
    // table instead so delete actions leave a durable trail.
    await recordChange({
      dataModelId: modelId,
      objectId: modelId,
      objectType: 'model',
      action: 'delete',
      changedBy: userId,
      beforeState: before,
    });

    logger.info({ userId, modelId }, 'Model Studio: model deleted (cascade)');
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, userId, modelId }, 'deleteModel failed');
    throw new DBError('deleteModel');
  }
}
