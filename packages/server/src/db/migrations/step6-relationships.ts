/**
 * Step 6 — Relationships + IE/IDEF1X notation data migrations.
 *
 * Two idempotent ALTERs that adapt the existing `data_model_canvas_states`
 * and `data_model_relationships` tables to carry the new Step-6 columns
 * and indexes. Both are wrapped in `runOnce(name, fn)` by the caller
 * (see `admin.service.ts`), but each also uses `IF NOT EXISTS` as a
 * belt-and-braces defence against an accidental direct invocation or a
 * `runOnce` marker that was manually deleted in dev.
 *
 * Migration A (notation column):
 *   - Add `notation VARCHAR(10) NOT NULL DEFAULT 'ie'` with a CHECK
 *     constraint enforcing `'ie' | 'idef1x'`. The enum MUST stay in lockstep
 *     with `packages/shared/src/utils/model-studio.schemas.ts` NOTATION
 *     (lowercase values, Step-6 §1.1A).
 *   - Nullable-with-default avoids a table rewrite on Postgres ≥ 11 (fast
 *     metadata-only ALTER).
 *
 * Migration B (relationships version + indexes):
 *   - Add `version INT NOT NULL DEFAULT 1` (matches zod contract in shared).
 *   - Create unique triple index to guarantee 409-on-duplicate per 6A.
 *   - Create partial index on identifying rels to speed cycle-detection
 *     walks (`detectCycleIdentifying`, Step-6 §2 S6-U16).
 *
 * Rollback is intentionally NOT scripted: the new column has a safe default
 * and the indexes can be dropped manually by an ops runbook entry in
 * `docs/model-studio/relationships.md`.
 */

import { sql } from 'drizzle-orm';
import { db } from '../index.js';
import { logger } from '../../config/logger.js';

/**
 * Migration A — add the `notation` column to `data_model_canvas_states`.
 *
 * Backwards-compatible: the column is NOT NULL but has a safe default so
 * existing rows backfill automatically. Re-running is a no-op thanks to
 * IF NOT EXISTS and the fact that Postgres treats an identical ADD
 * CONSTRAINT as a no-op once the CHECK already exists.
 */
export async function addCanvasStatesNotationColumn(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-canvas-states-notation-column' },
    'applying Step 6 notation column migration',
  );

  // ADD COLUMN is idempotent via IF NOT EXISTS. The CHECK constraint is
  // created inline with the column — Postgres will reject an attempt to
  // re-add a column with the same name even IF NOT EXISTS silences the
  // second run cleanly.
  await db.execute(sql`
    ALTER TABLE data_model_canvas_states
      ADD COLUMN IF NOT EXISTS notation VARCHAR(10) NOT NULL DEFAULT 'ie'
        CHECK (notation IN ('ie','idef1x'))
  `);

  logger.info(
    {
      migration: 'add-canvas-states-notation-column',
      durationMs: Date.now() - startedAt,
    },
    'Step 6 notation column migration complete',
  );
}

/**
 * Migration B — add the `version` column + unique-triple index + partial
 * identifying index to `data_model_relationships`.
 *
 * All three statements are idempotent (`IF NOT EXISTS`). Running order
 * matters only if the table is huge: the column add is metadata-only, the
 * index creates are the expensive step. Consider `CREATE INDEX CONCURRENTLY`
 * if this is ever run against a loaded prod table — currently the table is
 * empty in every environment, so a plain CREATE INDEX is fine.
 */
export async function addRelationshipsVersionAndIndexes(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-relationships-version-and-indexes' },
    'applying Step 6 relationships version + indexes migration',
  );

  await db.execute(sql`
    ALTER TABLE data_model_relationships
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_data_model_rels_unique_triple
      ON data_model_relationships (
        data_model_id,
        source_entity_id,
        target_entity_id,
        COALESCE(name, '')
      )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_model_rels_identifying
      ON data_model_relationships (source_entity_id, target_entity_id)
      WHERE is_identifying = true
  `);

  logger.info(
    {
      migration: 'add-relationships-version-and-indexes',
      durationMs: Date.now() - startedAt,
    },
    'Step 6 relationships version + indexes migration complete',
  );
}
