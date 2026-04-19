import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { DBError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/**
 * Model Studio — Step 1 service surface.
 *
 * Owns:
 *  - Reading / writing the `enable_model_studio` feature flag in the
 *    `settings` key/value table.
 *
 * Future (Step 2+): model CRUD, authz helper `canAccessModel`, embeddings,
 * RAG, DDL export, change log. Deliberately tight for Step 1 so scaffold
 * verification is unambiguous.
 */

export const MODEL_STUDIO_FLAG_KEY = 'enable_model_studio';

/** Reads the flag from settings. Returns false if row missing. */
export async function getFlagEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, MODEL_STUDIO_FLAG_KEY))
      .limit(1);
    // Settings stores values as text — 'true' means enabled.
    return row?.value === 'true';
  } catch (err) {
    logger.error({ err, key: MODEL_STUDIO_FLAG_KEY }, 'Failed to read Model Studio flag');
    throw new DBError('read', 'Could not read Model Studio flag');
  }
}

/** Upserts the flag. Admin-gated at the route layer. */
export async function setFlagEnabled(enabled: boolean): Promise<boolean> {
  const value = enabled ? 'true' : 'false';
  try {
    await db
      .insert(settings)
      .values({ key: MODEL_STUDIO_FLAG_KEY, value, isSecret: false })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      });
    logger.info({ enabled }, 'Model Studio flag updated');
    return enabled;
  } catch (err) {
    logger.error({ err, enabled }, 'Failed to write Model Studio flag');
    throw new DBError('write', 'Could not update Model Studio flag');
  }
}
