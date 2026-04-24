import type { PgDatabase } from 'drizzle-orm/pg-core';
import { logger } from '../config/logger.js';

/**
 * SERIALIZABLE transaction wrapper with bounded retry on 40001
 * (serialization_failure). Introduced in Step 7 to give the layer-link
 * and attribute-link cycle-detection paths race-safety: two tabs
 * concurrently creating mirror links (A→B and B→A) would both pass a
 * READ COMMITTED cycle-BFS check because neither sees the other's
 * uncommitted insert. Under SERIALIZABLE, one of the two transactions
 * aborts with 40001 and is retried.
 *
 * Reused by:
 *   - `model-studio-layer-links.service.ts`    (createLink)
 *   - `model-studio-attribute-links.service.ts` (createAttributeLink)
 *   - `model-studio-projection.service.ts`     (auto-project orchestrator)
 *
 * Retry policy: 3 attempts total (1 initial + 2 retries). Random
 * jitter 10-50ms between attempts to break lockstep between racing
 * tabs. After 3 attempts the original 40001 surfaces to the caller,
 * which normally handles it as a ConflictError (409) — the user
 * retries the action, at worst with a brief delay.
 *
 * Non-40001 errors bubble immediately — no blind retry on unrelated
 * failures (unique violations, FK errors, app errors).
 */

/** Postgres serialization_failure SQLSTATE. */
const SERIALIZATION_FAILURE = '40001';
/** Max attempts = 1 initial + 2 retries. Higher values are a foot-gun
 *  under sustained contention (retry storm). Three is the sweet spot
 *  the docs and every prod-hardened pattern I know of land on. */
const MAX_ATTEMPTS = 3;
/** Jitter bounds in milliseconds. Too small and racing tabs stay
 *  locked in phase; too large and the user feels the delay. */
const JITTER_MIN_MS = 10;
const JITTER_MAX_MS = 50;

/** Type-narrow an unknown error to a shape that carries a pg SQLSTATE.
 *  Drizzle wraps node-postgres errors; the SQLSTATE can surface on the
 *  top-level error, on `.cause`, or as a nested object — we check all
 *  three to stay robust across Drizzle versions. */
function isSerializationFailure(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const top = (err as { code?: unknown }).code;
  if (top === SERIALIZATION_FAILURE) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === 'object' &&
    (cause as { code?: unknown }).code === SERIALIZATION_FAILURE
  ) {
    return true;
  }
  return false;
}

/** Await the next tick + a small random jitter so racing transactions
 *  don't retry in lockstep. Returns a Promise that resolves after the
 *  delay; safe to `await` inside a retry loop. */
function jitterDelay(): Promise<void> {
  const ms = JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes `fn` inside a SERIALIZABLE transaction, retrying up to 3
 * times on Postgres 40001 (serialization_failure). Every other error
 * surfaces immediately.
 *
 * @param db   Drizzle pg database handle (or a session — anything that
 *             exposes `.transaction(fn, options)`).
 * @param fn   The transaction body. Receives the `tx` handle and must
 *             return a promise. MUST be idempotent — the function body
 *             may run up to 3 times under contention.
 */
export async function runSerializable<TDb extends PgDatabase<any, any, any>, TResult>(
  db: TDb,
  fn: (
    tx: Parameters<TDb['transaction']>[0] extends (tx: infer Tx) => any ? Tx : never,
  ) => Promise<TResult>,
): Promise<TResult> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return (await db.transaction(fn as Parameters<TDb['transaction']>[0], {
        isolationLevel: 'serializable',
      })) as TResult;
    } catch (err) {
      lastErr = err;
      if (!isSerializationFailure(err)) {
        // Not a serialization conflict — bubble immediately so the
        // caller can map it to the right AppError subclass.
        throw err;
      }
      if (attempt < MAX_ATTEMPTS) {
        logger.warn(
          { attempt, maxAttempts: MAX_ATTEMPTS },
          'SERIALIZABLE tx hit 40001 — retrying with jitter',
        );
        await jitterDelay();
        continue;
      }
      // Exhausted retries — log and rethrow the final 40001. Callers
      // typically surface this as ConflictError(409) "please retry".
      logger.error(
        { attempt },
        'SERIALIZABLE tx failed after max attempts — surfacing 40001 to caller',
      );
    }
  }
  // Unreachable in practice: the loop either returns on success or
  // re-throws on the last iteration. The explicit throw here satisfies
  // TypeScript's control-flow analysis.
  throw lastErr;
}
