import { eq, and, sql, desc, lte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import { InsufficientCreditsError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Cache for credit costs (invalidated on admin update)
// ---------------------------------------------------------------------------

let cachedCosts: Map<string, { baseCost: number; premiumMultiplier: number }> | null = null;

// ---------------------------------------------------------------------------
// Credit cost lookups
// ---------------------------------------------------------------------------

/**
 * Load all active credit costs from DB, cache them.
 */
export async function getCreditCosts(): Promise<
  Map<string, { baseCost: number; premiumMultiplier: number }>
> {
  if (cachedCosts) return cachedCosts;

  const rows = await db.query.creditCosts.findMany({
    where: eq(schema.creditCosts.isActive, true),
  });

  cachedCosts = new Map();
  for (const row of rows) {
    cachedCosts.set(row.actionType, {
      baseCost: row.baseCost,
      premiumMultiplier: parseFloat(row.premiumMultiplier),
    });
  }

  return cachedCosts;
}

/**
 * Get credit cost for a specific action type.
 * Returns 0 if action type is not configured (free action).
 */
export async function getCreditCostForAction(
  actionType: string,
  isPremiumModel = false,
): Promise<number> {
  const costs = await getCreditCosts();
  const cost = costs.get(actionType);
  if (!cost) return 0;

  const multiplier = isPremiumModel ? cost.premiumMultiplier : 1;
  return Math.ceil(cost.baseCost * multiplier);
}

/**
 * Invalidate the credit costs cache (called when admin updates costs).
 */
export function invalidateCreditCosts(): void {
  cachedCosts = null;
  logger.info('Credit costs cache invalidated');
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * Get current credit balance for a user.
 */
export async function getBalance(
  userId: string,
): Promise<{ creditsRemaining: number; creditsAllocated: number; planName: string }> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  });

  if (!sub) {
    // No subscription record — treat as free tier defaults
    return { creditsRemaining: 0, creditsAllocated: 0, planName: 'free' };
  }

  // Get the plan name
  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, sub.planId),
  });

  return {
    creditsRemaining: sub.creditsRemaining,
    creditsAllocated: sub.creditsAllocated,
    planName: plan?.name ?? 'free',
  };
}

// ---------------------------------------------------------------------------
// Deduction (atomic with row lock)
// ---------------------------------------------------------------------------

/**
 * Deduct credits for an action. Uses SELECT FOR UPDATE to prevent races.
 * Throws InsufficientCreditsError if balance is too low.
 */
export async function deductCredits(
  userId: string,
  actionType: string,
  cost: number,
  metadata: Record<string, unknown> = {},
): Promise<{ creditsRemaining: number }> {
  return await db.transaction(async (tx) => {
    // Lock the subscription row
    const rows = await tx.execute(
      sql`SELECT id, credits_remaining FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );

    const sub = (rows as unknown as Array<{ id: string; credits_remaining: number }>)[0];

    if (!sub) {
      throw new InsufficientCreditsError(cost, 0, actionType);
    }

    if (sub.credits_remaining < cost) {
      throw new InsufficientCreditsError(cost, sub.credits_remaining, actionType);
    }

    const newBalance = sub.credits_remaining - cost;

    // Deduct
    await tx
      .update(schema.subscriptions)
      .set({
        creditsRemaining: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, sub.id));

    // Log transaction
    await tx.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: sub.id,
      amount: -cost,
      balanceAfter: newBalance,
      actionType: 'deduction',
      description: actionType,
      metadata: { ...metadata, actionType },
    });

    logger.info({ userId, actionType, cost, newBalance }, 'Credits deducted');

    return { creditsRemaining: newBalance };
  });
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

/**
 * Refund credits (e.g., on AI call failure).
 */
export async function refundCredits(userId: string, amount: number, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, credits_remaining FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );

    const sub = (rows as unknown as Array<{ id: string; credits_remaining: number }>)[0];
    if (!sub) return;

    const newBalance = sub.credits_remaining + amount;

    await tx
      .update(schema.subscriptions)
      .set({
        creditsRemaining: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, sub.id));

    await tx.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: sub.id,
      amount,
      balanceAfter: newBalance,
      actionType: 'refund',
      description: reason,
    });

    logger.info({ userId, amount, newBalance, reason }, 'Credits refunded');
  });
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Allocate credits to a user (on subscription activation or monthly reset).
 */
export async function allocateCredits(
  userId: string,
  subscriptionId: string,
  amount: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.subscriptions)
      .set({
        creditsRemaining: amount,
        creditsAllocated: amount,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, subscriptionId));

    await tx.insert(schema.creditTransactions).values({
      userId,
      subscriptionId,
      amount,
      balanceAfter: amount,
      actionType: 'allocation',
      description: reason,
    });

    logger.info({ userId, amount, reason }, 'Credits allocated');
  });
}

// ---------------------------------------------------------------------------
// Admin adjustment
// ---------------------------------------------------------------------------

/**
 * Manually adjust a user's credits (admin action).
 */
export async function adjustCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<{ newBalance: number }> {
  return await db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, credits_remaining FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );

    const sub = (rows as unknown as Array<{ id: string; credits_remaining: number }>)[0];
    if (!sub) {
      throw new Error(`No subscription found for user ${userId}`);
    }

    const newBalance = sub.credits_remaining + amount;

    await tx
      .update(schema.subscriptions)
      .set({
        creditsRemaining: Math.max(0, newBalance),
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, sub.id));

    await tx.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: sub.id,
      amount,
      balanceAfter: Math.max(0, newBalance),
      actionType: 'adjustment',
      description: reason,
    });

    logger.info(
      { userId, amount, newBalance: Math.max(0, newBalance), reason },
      'Credits adjusted by admin',
    );
    return { newBalance: Math.max(0, newBalance) };
  });
}

// ---------------------------------------------------------------------------
// Credit forecast
// ---------------------------------------------------------------------------

/**
 * Calculate estimated days remaining based on 7-day rolling average usage.
 * Returns null if insufficient history to forecast.
 *
 * Algorithm: sum deductions over last 7 days → divide by days with activity
 *            → extrapolate to creditsRemaining.
 * Cached client-side (SubscriptionContext refreshes on focus, ~1hr effective TTL).
 */
export async function getCreditForecast(
  userId: string,
): Promise<{ daysRemaining: number | null; avgDailyUsage: number }> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Sum deductions over the last 7 days
  const result = await db.execute(
    sql`SELECT COALESCE(ABS(SUM(amount)), 0) AS total_used,
               COUNT(DISTINCT DATE(created_at)) AS active_days
        FROM credit_transactions
        WHERE user_id = ${userId}
          AND action_type = 'deduction'
          AND created_at >= ${sevenDaysAgo}`,
  );

  const row = (result as unknown as Array<{ total_used: number; active_days: number }>)[0];
  const totalUsed = Number(row?.total_used ?? 0);
  const activeDays = Number(row?.active_days ?? 0);

  if (activeDays === 0 || totalUsed === 0) {
    return { daysRemaining: null, avgDailyUsage: 0 };
  }

  // Average over 7 calendar days (not just active days) for realistic forecast
  const avgDailyUsage = Math.round(totalUsed / 7);

  // Get current balance
  const sub = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  });

  if (!sub || avgDailyUsage === 0) {
    return { daysRemaining: null, avgDailyUsage };
  }

  const daysRemaining = Math.floor(sub.creditsRemaining / avgDailyUsage);

  return { daysRemaining, avgDailyUsage };
}

// ---------------------------------------------------------------------------
// Usage breakdown
// ---------------------------------------------------------------------------

/**
 * Get credit usage breakdown by action type for a billing period.
 */
export async function getUsageBreakdown(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Array<{ actionType: string; totalCredits: number; count: number }>> {
  const rows = await db.execute(
    sql`SELECT description AS action_type,
               ABS(SUM(amount)) AS total_credits,
               COUNT(*)::int AS count
        FROM credit_transactions
        WHERE user_id = ${userId}
          AND action_type = 'deduction'
          AND created_at >= ${periodStart}
          AND created_at <= ${periodEnd}
        GROUP BY description
        ORDER BY total_credits DESC`,
  );

  return (
    rows as unknown as Array<{ action_type: string; total_credits: number; count: number }>
  ).map((r) => ({
    actionType: r.action_type,
    totalCredits: Number(r.total_credits),
    count: Number(r.count),
  }));
}

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

/**
 * Get credit transaction history for a user (paginated).
 */
export async function getTransactionHistory(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<Array<typeof schema.creditTransactions.$inferSelect>> {
  return await db.query.creditTransactions.findMany({
    where: eq(schema.creditTransactions.userId, userId),
    orderBy: [desc(schema.creditTransactions.createdAt)],
    limit,
    offset,
  });
}

// ---------------------------------------------------------------------------
// Monthly reset (cron job)
// ---------------------------------------------------------------------------

/**
 * Reset credits for all active subscriptions whose billing period has ended.
 * Processes in batches to avoid long-running transactions.
 */
export async function resetExpiredCredits(): Promise<number> {
  const now = new Date();
  let resetCount = 0;

  // Find subscriptions whose period has ended
  const expiredSubs = await db.query.subscriptions.findMany({
    where: and(
      eq(schema.subscriptions.status, 'active'),
      lte(schema.subscriptions.currentPeriodEnd, now),
    ),
  });

  for (const sub of expiredSubs) {
    try {
      // Get the plan to know how many credits to allocate
      const plan = await db.query.subscriptionPlans.findFirst({
        where: eq(schema.subscriptionPlans.id, sub.planId),
      });

      if (!plan) continue;

      // Calculate new period
      const newPeriodStart = sub.currentPeriodEnd!;
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      await db.transaction(async (tx) => {
        // Reset credits and advance period
        await tx
          .update(schema.subscriptions)
          .set({
            creditsRemaining: plan.creditsPerMonth,
            creditsAllocated: plan.creditsPerMonth,
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.id, sub.id));

        // Log the allocation
        await tx.insert(schema.creditTransactions).values({
          userId: sub.userId,
          subscriptionId: sub.id,
          amount: plan.creditsPerMonth,
          balanceAfter: plan.creditsPerMonth,
          actionType: 'allocation',
          description: 'Monthly credit reset',
        });
      });

      resetCount++;
      logger.info({ userId: sub.userId, credits: plan.creditsPerMonth }, 'Monthly credits reset');
    } catch (error) {
      logger.error(
        { subscriptionId: sub.id, error: error instanceof Error ? error.message : String(error) },
        'Failed to reset credits for subscription',
      );
      // Continue with next subscription — don't let one failure block others
    }
  }

  logger.info({ resetCount }, 'Monthly credit reset complete');
  return resetCount;
}

// ---------------------------------------------------------------------------
// Credit costs CRUD (admin)
// ---------------------------------------------------------------------------

/**
 * List all credit costs.
 */
export async function listCreditCosts(): Promise<Array<typeof schema.creditCosts.$inferSelect>> {
  return await db.query.creditCosts.findMany({
    orderBy: [desc(schema.creditCosts.baseCost)],
  });
}

/**
 * Update a credit cost entry.
 */
export async function updateCreditCost(
  id: string,
  data: { baseCost?: number; premiumMultiplier?: string; displayName?: string; isActive?: boolean },
): Promise<typeof schema.creditCosts.$inferSelect | undefined> {
  const [updated] = await db
    .update(schema.creditCosts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.creditCosts.id, id))
    .returning();

  invalidateCreditCosts();
  return updated;
}

/**
 * Seed default credit costs if none exist.
 */
export async function seedDefaultCreditCosts(): Promise<void> {
  const existing = await db.query.creditCosts.findFirst();
  if (existing) return;

  const defaults = [
    {
      actionType: 'social_post',
      displayName: 'Social Post',
      baseCost: 1,
      premiumMultiplier: '2.00',
    },
    {
      actionType: 'article',
      displayName: 'Long-form Article',
      baseCost: 3,
      premiumMultiplier: '2.00',
    },
    {
      actionType: 'repurpose',
      displayName: 'Content Repurpose',
      baseCost: 2,
      premiumMultiplier: '2.00',
    },
    {
      actionType: 'image_gen',
      displayName: 'Image Generation',
      baseCost: 5,
      premiumMultiplier: '1.00',
    },
    {
      actionType: 'video_gen',
      displayName: 'Video Generation',
      baseCost: 50,
      premiumMultiplier: '1.00',
    },
  ];

  await db.insert(schema.creditCosts).values(defaults);
  logger.info('Default credit costs seeded');
}
