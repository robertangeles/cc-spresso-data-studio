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

/**
 * Canonical action verbs written into `data_model_change_log.action`.
 *
 * The original three (`create` / `update` / `delete`) cover the entity
 * + attribute CRUD surface. Step 6 adds three relationship-specific
 * verbs so the audit humaniser can render them as distinct phrases:
 *   - `propagate` — identifying-rel PK propagation wrote new child attrs.
 *   - `unwind`    — identifying toggled off / rel deleted, propagated
 *                   attrs removed.
 *   - `infer`     — FK-graph inference generated a relationship proposal.
 *
 * The DB column is `varchar(20)` so no migration is needed to add new
 * verbs. Extending the union (rather than stringly-typing) keeps the
 * audit humaniser exhaustive — new verbs surface as TS errors until
 * `auditFormatter.ts` handles them.
 */
export type ChangeLogAction = 'create' | 'update' | 'delete' | 'propagate' | 'unwind' | 'infer';

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
