import { db } from '../db/index.js';
import { dataModelChangeLog } from '../db/schema.js';
import { logger } from '../config/logger.js';

/**
 * Every Model Studio mutation writes one row to data_model_change_log.
 *
 * Design goals (from CEO review Section 10 / plan):
 *   - Audit trail: {before, after, who, when} for every write.
 *   - Phase-2 event-bus seed: this table becomes the source of events
 *     when governance / lineage / presence plug in later.
 *   - Fault-tolerant: if the change_log write itself fails, log the
 *     error and continue — losing an audit row is always worse than
 *     losing the user's actual mutation.
 */

export type ChangeLogAction = 'create' | 'update' | 'delete';

export interface ChangeLogInput {
  dataModelId: string;
  objectId: string;
  objectType: string; // 'model' | 'entity' | 'attribute' | ...
  action: ChangeLogAction;
  changedBy: string;
  beforeState?: unknown;
  afterState?: unknown;
}

export async function recordChange(input: ChangeLogInput): Promise<void> {
  try {
    await db.insert(dataModelChangeLog).values({
      dataModelId: input.dataModelId,
      objectId: input.objectId,
      objectType: input.objectType,
      action: input.action,
      changedBy: input.changedBy,
      // Drizzle JSONB columns accept any JSON-serialisable value.
      beforeState: (input.beforeState as object | undefined) ?? null,
      afterState: (input.afterState as object | undefined) ?? null,
    });
  } catch (err) {
    // Do NOT rethrow — a failed audit row must not roll back user work.
    logger.error(
      {
        err,
        dataModelId: input.dataModelId,
        objectId: input.objectId,
        objectType: input.objectType,
        action: input.action,
      },
      'change_log write failed — audit integrity alert',
    );
  }
}
