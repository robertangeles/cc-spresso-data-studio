/**
 * Step 6 Direction A — alt-key group labels on entities.
 *
 * A single idempotent data migration that adds the `alt_key_labels`
 * JSONB column to `data_model_entities`. The column stores an optional
 * one-line "purpose" description per alt-key group, keyed by the AK
 * group name (e.g. `{"AK1": "NI number — UK tax identifier"}`).
 *
 * The badge rendered on the entity card stays `AK1`/`AK2`/… (per Erwin
 * convention — AK names are auto-numbered, not renamed). The label is
 * a separate descriptive string surfaced via tooltip on the badge and
 * used as the basis for DDL constraint names when exported in Step 9.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS` makes the migration safe to
 * re-run. Wrapped in `runOnce(name, fn)` by the caller (see
 * `admin.service.ts`) so the applied_migrations audit trail is kept
 * accurate and boot-time log spam is suppressed.
 *
 * No index is required: the column is only read alongside the entity
 * row itself, never as a standalone lookup.
 *
 * Rollback is intentionally NOT scripted: the new column is not-null
 * with a default of `'{}'`, so dropping it is a manual runbook step.
 */

import { sql } from 'drizzle-orm';
import { db } from '../index.js';
import { logger } from '../../config/logger.js';

/**
 * Migration — add the `alt_key_labels` JSONB column to
 * `data_model_entities` with a default of `'{}'`.
 *
 * Idempotent: `IF NOT EXISTS`. No backfill required because the
 * default supplies an empty map for every existing row atomically.
 */
export async function addEntitiesAltKeyLabelsColumn(): Promise<void> {
  const startedAt = Date.now();
  logger.info(
    { migration: 'add-entities-alt-key-labels' },
    'applying Step 6 Direction A alt_key_labels column migration',
  );

  await db.execute(sql`
    ALTER TABLE data_model_entities
      ADD COLUMN IF NOT EXISTS alt_key_labels JSONB NOT NULL DEFAULT '{}'
  `);

  logger.info(
    {
      migration: 'add-entities-alt-key-labels',
      durationMs: Date.now() - startedAt,
    },
    'Step 6 Direction A alt_key_labels column migration complete',
  );
}
