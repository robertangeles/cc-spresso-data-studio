import { eq } from 'drizzle-orm';
import type { CreateRuleDTO, UpdateRuleDTO, UpdateProfileDTO } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as stripeService from './stripe.service.js';
import { logger } from '../config/logger.js';

// --- Profile ---

export async function getProfile(userId: string) {
  let profile = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.userId, userId),
  });

  // Auto-create profile if it doesn't exist
  if (!profile) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    const [created] = await db
      .insert(schema.userProfiles)
      .values({
        userId,
        displayName: user?.name ?? '',
      })
      .returning();
    profile = created;
  }

  return profile;
}

export async function updateProfile(userId: string, data: UpdateProfileDTO) {
  // Ensure profile exists
  await getProfile(userId);

  const [updated] = await db
    .update(schema.userProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.userProfiles.userId, userId))
    .returning();

  // Sync billing identity to Stripe if brandName or taxId changed
  if (data.brandName !== undefined || data.taxId !== undefined || data.taxIdType !== undefined) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (user?.stripeCustomerId) {
      const displayName = updated.brandName || user.name;
      stripeService
        .syncCustomerBilling(user.stripeCustomerId, displayName, updated.taxId, updated.taxIdType)
        .catch((err) => {
          // Non-blocking: don't fail profile save if Stripe sync fails
          logger.error(
            { error: err instanceof Error ? err.message : String(err), userId },
            'Failed to sync billing info to Stripe (non-blocking)',
          );
        });
    }
  }

  return updated;
}

// --- Rules ---

export async function listRules(userId: string) {
  return db.query.userRules.findMany({
    where: eq(schema.userRules.userId, userId),
    orderBy: schema.userRules.createdAt,
  });
}

export async function getActiveRules(userId: string) {
  const rules = await db.query.userRules.findMany({
    where: eq(schema.userRules.userId, userId),
  });
  return rules.filter((r) => r.isActive);
}

export async function createRule(userId: string, data: CreateRuleDTO) {
  const [rule] = await db
    .insert(schema.userRules)
    .values({
      userId,
      name: data.name,
      rules: data.rules,
      category: data.category,
      isActive: true,
    })
    .returning();

  return rule;
}

export async function updateRule(userId: string, ruleId: string, data: UpdateRuleDTO) {
  const rule = await db.query.userRules.findFirst({
    where: eq(schema.userRules.id, ruleId),
  });

  if (!rule) throw new NotFoundError('Rule');
  if (rule.userId !== userId) throw new ForbiddenError('You can only edit your own rules');

  const [updated] = await db
    .update(schema.userRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.userRules.id, ruleId))
    .returning();

  return updated;
}

export async function deleteRule(userId: string, ruleId: string) {
  const rule = await db.query.userRules.findFirst({
    where: eq(schema.userRules.id, ruleId),
  });

  if (!rule) throw new NotFoundError('Rule');
  if (rule.userId !== userId) throw new ForbiddenError('You can only delete your own rules');

  await db.delete(schema.userRules).where(eq(schema.userRules.id, ruleId));
}
