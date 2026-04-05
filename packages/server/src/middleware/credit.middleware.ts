import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, InsufficientCreditsError } from '../utils/errors.js';
import * as creditService from '../services/credit.service.js';
import { logger } from '../config/logger.js';

/**
 * Middleware factory that checks if the user has enough credits for an action.
 * Attaches the credit cost to `req.creditCost` for post-action deduction.
 *
 * Usage:
 *   router.post('/generate', authenticate, creditGuard('social_post'), controller.generate);
 *
 * After the action succeeds, call `deductAfterAction(req)` to deduct credits.
 */
export function creditGuard(actionType: string, isPremiumModel = false) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      // Check if billing is enabled
      const { db, schema } = await import('../db/index.js');
      const { eq } = await import('drizzle-orm');
      const billingFlag = await db.query.settings.findFirst({
        where: eq(schema.settings.key, 'billing_enabled'),
      });

      if (!billingFlag || billingFlag.value !== 'true') {
        // Billing disabled — allow all actions without credit checks
        next();
        return;
      }

      const cost = await creditService.getCreditCostForAction(actionType, isPremiumModel);

      if (cost === 0) {
        // Free action — no credit check needed
        next();
        return;
      }

      const balance = await creditService.getBalance(req.user.userId);

      if (balance.creditsRemaining < cost) {
        throw new InsufficientCreditsError(cost, balance.creditsRemaining, actionType);
      }

      // Attach cost info for post-action deduction
      (req as unknown as Record<string, unknown>).creditCost = cost;
      (req as unknown as Record<string, unknown>).creditActionType = actionType;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Deduct credits after a successful AI action.
 * Call this in the controller after the action completes successfully.
 */
export async function deductAfterAction(
  req: Request,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const cost = (req as unknown as Record<string, unknown>).creditCost as number | undefined;
  const actionType = (req as unknown as Record<string, unknown>).creditActionType as
    | string
    | undefined;

  if (!cost || !actionType || !req.user) return;

  try {
    await creditService.deductCredits(req.user.userId, actionType, cost, metadata);
  } catch (err) {
    logger.error(
      {
        userId: req.user.userId,
        actionType,
        cost,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to deduct credits after action',
    );
    // Don't throw — the action already completed. Log and investigate.
  }
}
