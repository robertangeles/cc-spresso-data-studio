/**
 * Step 6 Direction A — BK/AK + inverse verb phrases + display IDs.
 *
 * Three idempotent data migrations that adapt the existing
 * `data_model_attributes`, `data_model_relationships`, and
 * `data_model_entities` tables to carry the Direction A columns.
 * Each is wrapped in `runOnce(name, fn)` by the caller (see
 * `admin.service.ts`), and each also uses `IF NOT EXISTS` as a
 * belt-and-braces defence against a manually-deleted runOnce marker.
 *
 * Migration 1 — alt-key group on attributes:
 *   - `ALTER TABLE data_model_attributes ADD COLUMN IF NOT EXISTS
 *      alt_key_group VARCHAR(10) NULL` — natural business key grouping.
 *   - Partial index on `(entity_id, alt_key_group)` where the group
 *      is non-null. Note: the Direction A brief names this
 *      `(data_model_id, alt_key_group)`, but `data_model_attributes`
 *      has no `data_model_id` column (models reach attributes via
 *      their parent entity). The index here preserves the intent —
 *      fast lookup of all attrs in one AK group within an entity —
 *      which is the query the DDL exporter will issue when emitting
 *      the composite UNIQUE constraint.
 *
 * Migration 2 — inverse verb phrase on relationships:
 *   - `ALTER TABLE data_model_relationships ADD COLUMN IF NOT EXISTS
 *      inverse_name VARCHAR(128) NULL`. Pairs with the existing
 *      `name` column so the edge renders both forward and inverse
 *      verb phrases (e.g. "manages" / "is_managed_by").
 *
 * Migration 3 — display IDs on entities:
 *   - `ALTER TABLE data_model_entities ADD COLUMN IF NOT EXISTS
 *      display_id VARCHAR(20) NULL`.
 *   - Backfill every existing row with `E001`, `E002`, … partitioned
 *      per model, ordered by `created_at ASC`. A single UPDATE using
 *      `ROW_NUMBER() OVER (PARTITION BY data_model_id ORDER BY
 *      created_at)` computes the position; `'E' || LPAD(..., 3, '0')`
 *      composes the label. Only rows where `display_id IS NULL` get
 *      touched so re-runs are harmless.
 *
 * Rollback is intentionally NOT scripted: the new columns are
 * nullable with no default, and the index can be dropped manually
 * via the runbook entry in `docs/model-studio/relationships.md`.
 */

import { sql } from 'drizzle-orm';
import { db } from '../index.js';
import { logger } from '../../config/logger.js';

/**
 * Migration 1 — add the `alt_key_group` column + partial index to
 * `data_model_attributes`.
 *
 * Idempotent: both statements use `IF NOT EXISTS`. The partial index
 * lets the DDL exporter efficiently load all attributes participating
 * in a given AK group within an entity without scanning the full
 * attribute table of a large model.
 */
export async function addAttributesAltKeyGroupColumn(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-attributes-alt-key-group' },
    'applying Step 6 Direction A alt_key_group column migration',
  );

  await db.execute(sql`
    ALTER TABLE data_model_attributes
      ADD COLUMN IF NOT EXISTS alt_key_group VARCHAR(10)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_model_attributes_ak_group
      ON data_model_attributes (entity_id, alt_key_group)
      WHERE alt_key_group IS NOT NULL
  `);

  logger.info(
    {
      migration: 'add-attributes-alt-key-group',
      durationMs: Date.now() - startedAt,
    },
    'Step 6 Direction A alt_key_group column migration complete',
  );
}

/**
 * Migration 2 — add the `inverse_name` column to
 * `data_model_relationships`.
 *
 * Idempotent: `IF NOT EXISTS`. No index required — the column is only
 * queried alongside the rel row itself, never as a standalone lookup.
 */
export async function addRelationshipsInverseNameColumn(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-relationships-inverse-name' },
    'applying Step 6 Direction A inverse_name column migration',
  );

  await db.execute(sql`
    ALTER TABLE data_model_relationships
      ADD COLUMN IF NOT EXISTS inverse_name VARCHAR(128)
  `);

  logger.info(
    {
      migration: 'add-relationships-inverse-name',
      durationMs: Date.now() - startedAt,
    },
    'Step 6 Direction A inverse_name column migration complete',
  );
}

/**
 * Migration 3 — add the `display_id` column to `data_model_entities`
 * and backfill existing rows with `E001`, `E002`, … per model.
 *
 * Idempotent in two ways:
 *   1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — first-run adds the
 *      column; subsequent runs are no-ops.
 *   2. Backfill UPDATE is scoped to `WHERE display_id IS NULL` so any
 *      row already assigned (by a previous migration pass or by a
 *      fresh `createEntity` call) is left alone.
 *
 * The backfill uses a single window-function UPDATE:
 *
 *     UPDATE data_model_entities AS e
 *        SET display_id = 'E' || LPAD(n.rn::text, 3, '0')
 *       FROM (
 *         SELECT id,
 *                ROW_NUMBER() OVER (
 *                  PARTITION BY data_model_id
 *                  ORDER BY created_at ASC, id ASC
 *                ) AS rn
 *           FROM data_model_entities
 *          WHERE display_id IS NULL
 *       ) n
 *      WHERE e.id = n.id;
 *
 * `id ASC` is a tie-breaker on `created_at` equality so the assignment
 * is deterministic across runs. `LPAD(..., 3, '0')` pads to three
 * digits; the column is VARCHAR(20) so `E1000`+ still fit.
 */
export async function addEntitiesDisplayIdColumn(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-entities-display-id' },
    'applying Step 6 Direction A display_id column + backfill migration',
  );

  await db.execute(sql`
    ALTER TABLE data_model_entities
      ADD COLUMN IF NOT EXISTS display_id VARCHAR(20)
  `);

  const result = await db.execute(sql`
    UPDATE data_model_entities AS e
       SET display_id = 'E' || LPAD(n.rn::text, 3, '0')
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY data_model_id
                 ORDER BY created_at ASC, id ASC
               ) AS rn
          FROM data_model_entities
         WHERE display_id IS NULL
      ) n
     WHERE e.id = n.id
  `);

  logger.info(
    {
      migration: 'add-entities-display-id',
      durationMs: Date.now() - startedAt,
      backfilledRows: result.rowCount ?? 0,
    },
    'Step 6 Direction A display_id column + backfill complete',
  );
}
