import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { appliedMigrations } from './schema.js';
import { logger } from '../config/logger.js';

/**
 * One-shot runner for idempotent DATA migrations (backfills, alias
 * rewrites, normalisations). Distinct from drizzle-kit's SCHEMA
 * migrations — those handle DDL; this handles DML that should run
 * exactly once per environment.
 *
 * Usage:
 *
 *   await runOnce('migrate-model-id-prefixes', async () => {
 *     await db.execute(sql`UPDATE skills SET ...`);
 *   });
 *
 * Why this exists: previously every server boot would re-execute the
 * model-id alias migration (~100 SQL statements against production
 * Postgres). The WHERE clauses made it safe but it was noisy, wasteful,
 * and a real long-tail risk if anyone edited the alias map incorrectly.
 *
 * Race-safety: two server instances starting simultaneously could each
 * try to claim the same migration. We use INSERT ... ON CONFLICT DO
 * NOTHING + RETURNING so only the instance whose insert succeeds runs
 * the migration body. If the migration body throws, we delete the claim
 * so the next boot retries.
 *
 * Idempotency contract: the migration body MUST be safe to re-run if a
 * prior run was interrupted before the claim row was deleted. Concretely:
 * use `WHERE old_value = X` rewrites or `INSERT ... ON CONFLICT` patterns,
 * never blind appends.
 */

export interface RunOnceResult {
  /** True if THIS call ran the migration body. False if it was a no-op
   *  because the migration had already been applied. */
  ran: boolean;
}

export async function runOnce(name: string, fn: () => Promise<void>): Promise<RunOnceResult> {
  // Try to claim. Race-safe: if another instance got here first the
  // INSERT does nothing and the returning array is empty.
  const claim = await db
    .insert(appliedMigrations)
    .values({ name })
    .onConflictDoNothing({ target: appliedMigrations.name })
    .returning({ id: appliedMigrations.id });

  if (claim.length === 0) {
    logger.debug({ migration: name }, 'data migration already applied — skipping');
    return { ran: false };
  }

  try {
    const startedAt = Date.now();
    await fn();
    logger.info({ migration: name, durationMs: Date.now() - startedAt }, 'data migration applied');
    return { ran: true };
  } catch (err) {
    // Roll back our claim so the next boot can retry. This is critical:
    // without the rollback a half-failed migration would be marked done
    // and never get fixed.
    await db.delete(appliedMigrations).where(eq(appliedMigrations.name, name));
    logger.error(
      { err, migration: name },
      'data migration failed — claim rolled back, will retry on next boot',
    );
    throw err;
  }
}
