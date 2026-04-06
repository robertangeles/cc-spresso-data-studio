import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { ForbiddenError } from '../utils/errors.js';

/**
 * Middleware that checks whether the community feature is enabled in settings.
 * Returns 403 if community_enabled is not 'true'.
 */
export async function requireCommunityEnabled(_req: Request, _res: Response, next: NextFunction) {
  try {
    const row = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'community_enabled'))
      .limit(1);

    if (!row.length || row[0].value !== 'true') {
      return next(new ForbiddenError('Community feature is not enabled'));
    }
    next();
  } catch (err) {
    next(err);
  }
}
