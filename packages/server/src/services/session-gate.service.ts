import { eq, sql, and, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { SessionQuotaExceededError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/** Roles that bypass session metering (unlimited AI access). */
const UNLIMITED_ROLES = ['Administrator', 'Paid Subscriber', 'Founder Member'];

export interface SessionStatus {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Check whether the user has available sessions.
 * Bypass roles get unlimited access. Subscribers are metered.
 */
export async function checkSessionQuota(
  userId: string,
  role: string,
): Promise<{ shouldCount: boolean }> {
  if (UNLIMITED_ROLES.includes(role)) {
    logger.debug(
      { userId, role, action: 'session_check_bypassed' },
      'Unlimited role — skipping session gate',
    );
    return { shouldCount: false };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { freeSessionsUsed: true, freeSessionsLimit: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found during session check`);
  }

  if (user.freeSessionsUsed >= user.freeSessionsLimit) {
    logger.warn(
      {
        userId,
        used: user.freeSessionsUsed,
        limit: user.freeSessionsLimit,
        action: 'session_quota_exceeded',
      },
      'Free session quota exceeded',
    );
    throw new SessionQuotaExceededError(
      'Free session limit reached. Upgrade your plan to continue using AI features.',
      0,
      user.freeSessionsLimit,
    );
  }

  return { shouldCount: true };
}

/**
 * Atomically deduct one session. Uses a WHERE guard to prevent over-deduction.
 * Returns the new count of sessions used.
 */
export async function deductSession(userId: string): Promise<number> {
  const result = await db
    .update(schema.users)
    .set({
      freeSessionsUsed: sql`${schema.users.freeSessionsUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.users.id, userId),
        lt(schema.users.freeSessionsUsed, schema.users.freeSessionsLimit),
      ),
    )
    .returning({ freeSessionsUsed: schema.users.freeSessionsUsed });

  if (result.length === 0) {
    logger.warn(
      { userId, action: 'session_deduct_race' },
      'Atomic deduction failed — quota exhausted (race)',
    );
    throw new SessionQuotaExceededError();
  }

  const newUsed = result[0].freeSessionsUsed;
  logger.info(
    { userId, sessionsUsed: newUsed, action: 'session_deducted' },
    'Free session deducted',
  );
  return newUsed;
}

/**
 * Get the current session status for a user.
 */
export async function getSessionStatus(userId: string, role: string): Promise<SessionStatus> {
  if (UNLIMITED_ROLES.includes(role)) {
    return { unlimited: true, used: 0, limit: 0, remaining: 0 };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { freeSessionsUsed: true, freeSessionsLimit: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found during session status check`);
  }

  return {
    unlimited: false,
    used: user.freeSessionsUsed,
    limit: user.freeSessionsLimit,
    remaining: Math.max(0, user.freeSessionsLimit - user.freeSessionsUsed),
  };
}

/**
 * Check that a multi-step flow has enough remaining sessions before starting.
 * Throws SessionQuotaExceededError with a descriptive message if insufficient.
 */
export async function checkFlowQuota(
  userId: string,
  role: string,
  stepCount: number,
): Promise<{ shouldCount: boolean }> {
  if (UNLIMITED_ROLES.includes(role)) {
    return { shouldCount: false };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { freeSessionsUsed: true, freeSessionsLimit: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found during flow quota check`);
  }

  const remaining = user.freeSessionsLimit - user.freeSessionsUsed;
  if (remaining < stepCount) {
    throw new SessionQuotaExceededError(
      `This action requires ${stepCount} session${stepCount > 1 ? 's' : ''} but you have ${remaining} remaining. Upgrade your plan for unlimited access.`,
      remaining,
      user.freeSessionsLimit,
    );
  }

  return { shouldCount: true };
}

/**
 * Wrapper: check quota → deduct → execute the AI call.
 * Deduction happens BEFORE the AI call (session = attempt).
 */
export async function withSessionGate<T>(
  userId: string,
  role: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { shouldCount } = await checkSessionQuota(userId, role);

  if (shouldCount) {
    await deductSession(userId);
  }

  return fn();
}
