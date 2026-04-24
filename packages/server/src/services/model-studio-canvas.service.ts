import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dataModelCanvasStates } from '../db/schema.js';
import { DBError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import type { Layer, Notation } from '@cc/shared';

/**
 * Canvas state per (model, user, layer).
 *
 * Design notes (CEO review §4 / build order Step 3):
 *   - Canvas state (node positions + viewport) is separate from model
 *     data; it is a view on the model, not part of it.
 *   - One row per (model, user, layer). Unique index already in schema.
 *   - Upserts are optimistic: if no row exists yet we insert, else we
 *     update the existing row with the new positions + viewport.
 *   - We intentionally do NOT write change_log for canvas state — it
 *     is UI ephemera, not model authoring. Noise otherwise.
 */

export interface CanvasStateDTO {
  nodePositions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number };
  /** Per-user notation preference (Step 6). Defaults to 'ie' when the
   *  canvas row has never been written (DB column default is 'ie'). */
  notation: Notation;
  updatedAt: string | null;
}

function emptyState(): CanvasStateDTO {
  return {
    nodePositions: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    notation: 'ie',
    updatedAt: null,
  };
}

export async function getCanvasState(
  userId: string,
  modelId: string,
  layer: Layer,
): Promise<CanvasStateDTO> {
  await assertCanAccessModel(userId, modelId);

  const [row] = await db
    .select()
    .from(dataModelCanvasStates)
    .where(
      and(
        eq(dataModelCanvasStates.dataModelId, modelId),
        eq(dataModelCanvasStates.userId, userId),
        eq(dataModelCanvasStates.layer, layer),
      ),
    )
    .limit(1);

  if (!row) return emptyState();

  return {
    nodePositions: row.nodePositions as CanvasStateDTO['nodePositions'],
    viewport: row.viewport as CanvasStateDTO['viewport'],
    notation: (row.notation as Notation) ?? 'ie',
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function upsertCanvasState(
  userId: string,
  modelId: string,
  layer: Layer,
  state: Omit<CanvasStateDTO, 'updatedAt' | 'notation'> & { notation?: Notation },
): Promise<CanvasStateDTO> {
  await assertCanAccessModel(userId, modelId);

  try {
    // Only set `notation` on insert/update when the caller actually
    // provides one. Omitting preserves the DB column default ('ie') on
    // insert and the existing row's notation on update — so drag-end
    // saves from `useCanvasState` don't clobber the user's notation
    // preference.
    const insertRow: typeof dataModelCanvasStates.$inferInsert = {
      dataModelId: modelId,
      userId,
      layer,
      nodePositions: state.nodePositions,
      viewport: state.viewport,
    };
    if (state.notation) insertRow.notation = state.notation;

    const updateSet: Partial<typeof dataModelCanvasStates.$inferInsert> & {
      updatedAt: Date;
    } = {
      nodePositions: state.nodePositions,
      viewport: state.viewport,
      updatedAt: new Date(),
    };
    if (state.notation) updateSet.notation = state.notation;

    const [row] = await db
      .insert(dataModelCanvasStates)
      .values(insertRow)
      .onConflictDoUpdate({
        target: [
          dataModelCanvasStates.dataModelId,
          dataModelCanvasStates.userId,
          dataModelCanvasStates.layer,
        ],
        set: updateSet,
      })
      .returning();

    return {
      nodePositions: row.nodePositions as CanvasStateDTO['nodePositions'],
      viewport: row.viewport as CanvasStateDTO['viewport'],
      notation: (row.notation as Notation) ?? 'ie',
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  } catch (err) {
    logger.error({ err, userId, modelId, layer }, 'upsertCanvasState failed');
    throw new DBError('upsertCanvasState');
  }
}
