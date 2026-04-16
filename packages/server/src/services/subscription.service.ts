import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import * as stripeService from './stripe.service.js';
import { sendBillingEmail } from './emailTemplate.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Plan queries
// ---------------------------------------------------------------------------

/**
 * List all active subscription plans (for pricing page).
 */
export async function listPlans(): Promise<Array<typeof schema.subscriptionPlans.$inferSelect>> {
  return await db.query.subscriptionPlans.findMany({
    where: eq(schema.subscriptionPlans.isActive, true),
    orderBy: (plans, { asc }) => [asc(plans.sortOrder)],
  });
}

/**
 * Get a plan by ID.
 */
export async function getPlanById(
  planId: string,
): Promise<typeof schema.subscriptionPlans.$inferSelect> {
  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, planId),
  });
  if (!plan) throw new NotFoundError('Subscription plan');
  return plan;
}

/**
 * Get a plan by Stripe price ID — resolves via settings (plan name ↔ price ID mapping).
 * Falls back to the plans table stripePriceId column for backward compatibility.
 */
export async function getPlanByStripePriceId(
  stripePriceId: string,
): Promise<typeof schema.subscriptionPlans.$inferSelect | undefined> {
  // Primary: resolve plan name from Stripe settings
  const planName = await stripeService.getPlanNameByPriceId(stripePriceId);
  if (planName) {
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.name, planName),
    });
    if (plan) return plan;
  }

  // Fallback: direct lookup on plans table
  return await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.stripePriceId, stripePriceId),
  });
}

// ---------------------------------------------------------------------------
// Subscription queries
// ---------------------------------------------------------------------------

/**
 * Get the current subscription for a user (includes plan details).
 */
export async function getSubscription(userId: string): Promise<{
  subscription: typeof schema.subscriptions.$inferSelect | null;
  plan: typeof schema.subscriptionPlans.$inferSelect | null;
}> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  });

  if (!subscription) return { subscription: null, plan: null };

  const plan =
    (await db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.id, subscription.planId),
    })) ?? null;

  return { subscription, plan };
}

// ---------------------------------------------------------------------------
// Checkout flow
// ---------------------------------------------------------------------------

/**
 * Initiate a checkout session for a user to subscribe to a plan.
 */
export async function createCheckout(
  userId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const plan = await getPlanById(planId);

  // Guard: reject if user already has an active paid subscription.
  // Existing subscribers must use the change-plan endpoint instead.
  const { subscription: existingSub } = await getSubscription(userId);
  if (existingSub && existingSub.status === 'active' && existingSub.stripeSubscriptionId) {
    throw new ConflictError(
      'You already have an active subscription. Use Change Plan to upgrade or downgrade.',
    );
  }

  // Resolve Stripe Price ID from settings (not hardcoded on the plan)
  const priceId = await stripeService.getPriceIdForPlan(plan.name);

  // Get or create Stripe customer
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) throw new NotFoundError('User');

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    customerId = await stripeService.createCustomer(user.email, user.name, userId);
    await db
      .update(schema.users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // Create checkout session
  const checkoutUrl = await stripeService.createCheckoutSession({
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    userId,
  });

  // Clear pendingPlanId now that checkout has been initiated
  await db
    .update(schema.users)
    .set({ pendingPlanId: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return checkoutUrl;
}

// ---------------------------------------------------------------------------
// Activation (called from webhook)
// ---------------------------------------------------------------------------

/**
 * Activate a subscription after successful checkout.
 */
export async function activateSubscription(
  userId: string,
  stripeSubscriptionId: string,
  stripePriceId: string,
  stripeCustomerId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
): Promise<void> {
  // Find the plan
  const plan = await getPlanByStripePriceId(stripePriceId);
  if (!plan) {
    logger.error({ stripePriceId }, 'No plan found for Stripe price ID');
    return;
  }

  // Check for existing subscription
  const existing = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  });

  if (existing) {
    // Delta-based credit calculation for plan changes:
    // On upgrade: add the difference (newPlan.credits - oldPlan.credits) to remaining
    // On reactivation/new period: full reset to new plan credits
    const oldPlan = await db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.id, existing.planId),
    });

    const isPlanChange = oldPlan && oldPlan.id !== plan.id && existing.status === 'active';
    let newCreditsRemaining: number;
    let creditDelta: number;

    if (isPlanChange && oldPlan) {
      // Mid-cycle plan change: add the credit difference
      creditDelta = plan.creditsPerMonth - oldPlan.creditsPerMonth;
      if (creditDelta > 0) {
        // Upgrade: boost remaining credits by the delta
        newCreditsRemaining = Math.min(
          existing.creditsRemaining + creditDelta,
          plan.creditsPerMonth,
        );
      } else {
        // Downgrade: keep current remaining, but cap at new plan max
        // (actual reset happens at period end via Stripe schedule)
        newCreditsRemaining = Math.min(existing.creditsRemaining, plan.creditsPerMonth);
      }
    } else {
      // New subscription or period renewal: full allocation
      creditDelta = plan.creditsPerMonth;
      newCreditsRemaining = plan.creditsPerMonth;
    }

    await db
      .update(schema.subscriptions)
      .set({
        planId: plan.id,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'active',
        creditsRemaining: newCreditsRemaining,
        creditsAllocated: plan.creditsPerMonth,
        currentPeriodStart,
        currentPeriodEnd,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, existing.id));

    // Log credit transaction with accurate delta
    const description = isPlanChange
      ? `Plan change: ${oldPlan!.displayName} → ${plan.displayName} (${creditDelta > 0 ? '+' : ''}${creditDelta} credits)`
      : `Subscription activated: ${plan.displayName}`;

    await db.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: existing.id,
      amount: isPlanChange ? creditDelta : plan.creditsPerMonth,
      balanceAfter: newCreditsRemaining,
      actionType: isPlanChange ? 'plan_change' : 'allocation',
      description,
    });
  } else {
    // Create new subscription
    const [newSub] = await db
      .insert(schema.subscriptions)
      .values({
        userId,
        planId: plan.id,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'active',
        creditsRemaining: plan.creditsPerMonth,
        creditsAllocated: plan.creditsPerMonth,
        currentPeriodStart,
        currentPeriodEnd,
      })
      .returning();

    // Log credit allocation
    await db.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: newSub.id,
      amount: plan.creditsPerMonth,
      balanceAfter: plan.creditsPerMonth,
      actionType: 'allocation',
      description: `Subscription activated: ${plan.displayName}`,
    });
  }

  // Update user tier and role
  const isPaid = plan.priceCents > 0;
  const targetRoleName = isPaid ? 'Paid Subscriber' : 'Subscriber';
  const targetRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, targetRoleName),
  });

  await db
    .update(schema.users)
    .set({
      stripeCustomerId,
      subscriptionTier: plan.name,
      role: targetRoleName,
      roleId: targetRole?.id ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  logger.info({ userId, planName: plan.name, stripeSubscriptionId }, 'Subscription activated');
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Cancel a user's subscription at the end of the current billing period.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const { subscription } = await getSubscription(userId);
  if (!subscription?.stripeSubscriptionId) {
    throw new NotFoundError('Active subscription');
  }

  // Cancel in Stripe
  await stripeService.cancelSubscription(subscription.stripeSubscriptionId);

  // Update local record
  await db
    .update(schema.subscriptions)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.id, subscription.id));

  logger.info({ userId }, 'Subscription canceled at period end');
}

/**
 * Handle subscription deletion from Stripe (period ended after cancel).
 */
export async function deactivateSubscription(stripeSubscriptionId: string): Promise<void> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  });

  if (!subscription) return;

  // Find or create the free plan
  let freePlan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.name, 'free'),
  });

  if (!freePlan) {
    // Seed free plan if missing
    const [created] = await db
      .insert(schema.subscriptionPlans)
      .values({
        name: 'free',
        displayName: 'Free',
        priceCents: 0,
        creditsPerMonth: 1500,
        sortOrder: 0,
        features: ['1,500 AI credits/month', 'Standard models', 'Basic support'],
      })
      .returning();
    freePlan = created;
  }

  // Log credit expiry before reverting
  if (subscription.creditsRemaining > 0) {
    await db.insert(schema.creditTransactions).values({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      amount: -subscription.creditsRemaining,
      balanceAfter: 0,
      actionType: 'plan_expired',
      description: 'Subscription period ended — paid credits expired',
    });
  }

  // Revert to free tier
  await db
    .update(schema.subscriptions)
    .set({
      planId: freePlan.id,
      status: 'active',
      stripeSubscriptionId: null,
      creditsRemaining: freePlan.creditsPerMonth,
      creditsAllocated: freePlan.creditsPerMonth,
      canceledAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.id, subscription.id));

  // Update user tier and revert role to Subscriber
  const subscriberRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, 'Subscriber'),
  });

  await db
    .update(schema.users)
    .set({
      subscriptionTier: 'free',
      role: 'Subscriber',
      roleId: subscriberRole?.id ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, subscription.userId));

  logger.info({ userId: subscription.userId }, 'Subscription deactivated, reverted to free tier');
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * Process a Stripe webhook event.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  // Check idempotency
  const existing = await db.query.webhookEvents.findFirst({
    where: eq(schema.webhookEvents.stripeEventId, event.id),
  });

  if (existing) {
    logger.info({ eventId: event.id }, 'Duplicate webhook event, skipping');
    return;
  }

  // Record event
  await db.insert(schema.webhookEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    status: 'pending',
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        const stripeSub = await stripeService.getSubscription(session.subscription as string);

        const firstItem = stripeSub.items.data[0];
        const priceId = firstItem?.price?.id;
        if (!priceId || !firstItem) break;

        await activateSubscription(
          userId,
          stripeSub.id,
          priceId,
          session.customer as string,
          new Date(firstItem.current_period_start * 1000),
          new Date(firstItem.current_period_end * 1000),
        );

        // Send welcome email
        const welcomeUser = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
        const welcomePlan = await getPlanByStripePriceId(priceId);
        if (welcomeUser && welcomePlan) {
          sendBillingEmail(welcomeUser.email, 'subscription_welcome', {
            userName: welcomeUser.name,
            userEmail: welcomeUser.email,
            planName: welcomePlan.displayName,
            creditsAllocated: String(welcomePlan.creditsPerMonth),
            appName: 'Spresso Data Studio',
            appUrl: 'https://spresso.xyz',
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const subscription = await db.query.subscriptions.findFirst({
          where: eq(schema.subscriptions.stripeSubscriptionId, stripeSub.id),
        });

        if (!subscription) break;

        const updatedItem = stripeSub.items.data[0];
        const priceId = updatedItem?.price?.id;
        if (!priceId || !updatedItem) break;

        // Check if plan changed (upgrade/downgrade)
        const newPlan = await getPlanByStripePriceId(priceId);
        if (newPlan && newPlan.id !== subscription.planId) {
          // Detect direction: compare sortOrder to determine upgrade vs downgrade
          const oldPlan = await db.query.subscriptionPlans.findFirst({
            where: eq(schema.subscriptionPlans.id, subscription.planId),
          });
          const isUpgrade = !oldPlan || newPlan.sortOrder > oldPlan.sortOrder;

          await activateSubscription(
            subscription.userId,
            stripeSub.id,
            priceId,
            stripeSub.customer as string,
            new Date(updatedItem.current_period_start * 1000),
            new Date(updatedItem.current_period_end * 1000),
          );

          // Send direction-appropriate email
          const planChangeUser = await db.query.users.findFirst({
            where: eq(schema.users.id, subscription.userId),
          });
          if (planChangeUser) {
            const emailTemplate = isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded';
            const creditDelta = oldPlan
              ? newPlan.creditsPerMonth - oldPlan.creditsPerMonth
              : newPlan.creditsPerMonth;

            sendBillingEmail(planChangeUser.email, emailTemplate, {
              userName: planChangeUser.name,
              userEmail: planChangeUser.email,
              planName: newPlan.displayName,
              previousPlan: oldPlan?.displayName ?? 'Free',
              creditsAllocated: String(newPlan.creditsPerMonth),
              creditDelta: `${creditDelta > 0 ? '+' : ''}${creditDelta.toLocaleString()}`,
              appName: 'Spresso Data Studio',
              appUrl: 'https://spresso.xyz',
            });
          }
        }

        // Sync cancellation status
        if (stripeSub.cancel_at_period_end && subscription.status !== 'canceled') {
          await db
            .update(schema.subscriptions)
            .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, subscription.id));
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;

        // Look up user for email before deactivating
        const deletedSub = await db.query.subscriptions.findFirst({
          where: eq(schema.subscriptions.stripeSubscriptionId, stripeSub.id),
        });

        await deactivateSubscription(stripeSub.id);

        // Send cancellation email
        if (deletedSub) {
          const cancelUser = await db.query.users.findFirst({
            where: eq(schema.users.id, deletedSub.userId),
          });
          const cancelPlan = deletedSub.planId
            ? await db.query.subscriptionPlans.findFirst({
                where: eq(schema.subscriptionPlans.id, deletedSub.planId),
              })
            : null;
          if (cancelUser) {
            sendBillingEmail(cancelUser.email, 'subscription_canceled', {
              userName: cancelUser.name,
              userEmail: cancelUser.email,
              planName: cancelPlan?.displayName ?? 'your plan',
              appName: 'Spresso Data Studio',
              appUrl: 'https://spresso.xyz',
            });
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info({ customerId: invoice.customer, amount: invoice.amount_paid }, 'Invoice paid');

        // Restore from past_due if payment succeeds after failure
        if (invoice.customer) {
          const paidSub = await db.query.subscriptions.findFirst({
            where: eq(schema.subscriptions.stripeCustomerId, invoice.customer as string),
          });
          if (paidSub?.status === 'past_due') {
            await db
              .update(schema.subscriptions)
              .set({ status: 'active', updatedAt: new Date() })
              .where(eq(schema.subscriptions.id, paidSub.id));
            logger.info(
              { subscriptionId: paidSub.id },
              'Subscription restored from past_due to active',
            );
          }

          // Send payment confirmation email with invoice link
          if (paidSub) {
            const paidUser = await db.query.users.findFirst({
              where: eq(schema.users.id, paidSub.userId),
            });
            if (paidUser) {
              sendBillingEmail(paidUser.email, 'invoice_paid', {
                userName: paidUser.name,
                userEmail: paidUser.email,
                invoiceAmount: `$${(invoice.amount_paid / 100).toFixed(2)}`,
                invoiceDate: new Date().toLocaleDateString(),
                invoicePdfUrl: invoice.hosted_invoice_url ?? '',
                appName: 'Spresso Data Studio',
                appUrl: 'https://spresso.xyz',
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const failedSub = await db.query.subscriptions.findFirst({
          where: eq(schema.subscriptions.stripeCustomerId, invoice.customer as string),
        });

        if (failedSub) {
          await db
            .update(schema.subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, failedSub.id));

          // Send payment failed email
          const failedUser = await db.query.users.findFirst({
            where: eq(schema.users.id, failedSub.userId),
          });
          if (failedUser) {
            sendBillingEmail(failedUser.email, 'invoice_payment_failed', {
              userName: failedUser.name,
              userEmail: failedUser.email,
              invoiceAmount: `$${(invoice.amount_due / 100).toFixed(2)}`,
              invoicePdfUrl: invoice.hosted_invoice_url ?? '',
              appName: 'Spresso Data Studio',
              appUrl: 'https://spresso.xyz',
            });
          }
        }

        logger.warn({ customerId: invoice.customer }, 'Invoice payment failed');
        break;
      }

      default:
        logger.info({ eventType: event.type }, 'Unhandled webhook event type');
    }

    // Mark event as processed
    await db
      .update(schema.webhookEvents)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(schema.webhookEvents.stripeEventId, event.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ eventId: event.id, error: message }, 'Webhook processing failed');

    await db
      .update(schema.webhookEvents)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(schema.webhookEvents.stripeEventId, event.id));

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Plan change: preview + execute
// ---------------------------------------------------------------------------

/**
 * Preview the impact of changing to a different plan.
 * Returns proration cost for upgrades, or scheduled date for downgrades.
 *
 * Data flow:
 *   INPUT ──▶ VALIDATE ──▶ STRIPE PREVIEW ──▶ CREDIT DELTA ──▶ RESPONSE
 *     │           │              │                  │
 *     ▼           ▼              ▼                  ▼
 *   [no sub]  [same plan]    [timeout]         [negative delta]
 *   [bad id]  [free target]  [rate limit]      [cap at max]
 */
export async function previewPlanChange(
  userId: string,
  targetPlanId: string,
): Promise<{
  isUpgrade: boolean;
  isDowngrade: boolean;
  currentPlan: { name: string; displayName: string; creditsPerMonth: number };
  targetPlan: { name: string; displayName: string; creditsPerMonth: number; priceCents: number };
  creditDelta: number;
  newCreditsRemaining: number;
  proratedAmountDue: number | null;
  currency: string;
  effectiveDate: string;
  effectiveNow: boolean;
}> {
  const { subscription, plan: currentPlan } = await getSubscription(userId);
  if (!subscription || !currentPlan) {
    throw new NotFoundError('Active subscription');
  }
  if (!subscription.stripeSubscriptionId || !subscription.stripeCustomerId) {
    throw new ValidationError({
      subscription: ['No Stripe subscription found. Use checkout for initial subscription.'],
    });
  }

  const targetPlan = await getPlanById(targetPlanId);

  if (targetPlan.id === currentPlan.id) {
    throw new ValidationError({ targetPlanId: ['You are already on this plan.'] });
  }

  if (targetPlan.name === 'free') {
    throw new ValidationError({
      targetPlanId: ['Use the cancel endpoint to revert to the free tier.'],
    });
  }

  if (subscription.status === 'past_due') {
    throw new ValidationError({
      subscription: ['Please resolve your outstanding payment before changing plans.'],
    });
  }

  const isUpgrade = targetPlan.sortOrder > currentPlan.sortOrder;
  const isDowngrade = targetPlan.sortOrder < currentPlan.sortOrder;
  const creditDelta = targetPlan.creditsPerMonth - currentPlan.creditsPerMonth;

  let proratedAmountDue: number | null = null;
  let currency = 'usd';
  let effectiveDate: string;
  let effectiveNow: boolean;

  if (isUpgrade) {
    // Preview proration cost from Stripe
    const targetPriceId = await stripeService.getPriceIdForPlan(targetPlan.name);
    const preview = await stripeService.previewInvoice(
      subscription.stripeCustomerId,
      subscription.stripeSubscriptionId,
      targetPriceId,
    );
    proratedAmountDue = preview.proratedAmountDue;
    currency = preview.currency;
    effectiveDate = new Date().toISOString();
    effectiveNow = true;
  } else {
    // Downgrade takes effect at period end
    effectiveDate = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toISOString()
      : new Date().toISOString();
    effectiveNow = false;
  }

  // Calculate what credits would look like after the change
  let newCreditsRemaining: number;
  if (isUpgrade) {
    newCreditsRemaining = Math.min(
      subscription.creditsRemaining + creditDelta,
      targetPlan.creditsPerMonth,
    );
  } else {
    // Downgrade: credits don't change until period end
    newCreditsRemaining = subscription.creditsRemaining;
  }

  return {
    isUpgrade,
    isDowngrade,
    currentPlan: {
      name: currentPlan.name,
      displayName: currentPlan.displayName,
      creditsPerMonth: currentPlan.creditsPerMonth,
    },
    targetPlan: {
      name: targetPlan.name,
      displayName: targetPlan.displayName,
      creditsPerMonth: targetPlan.creditsPerMonth,
      priceCents: targetPlan.priceCents,
    },
    creditDelta,
    newCreditsRemaining,
    proratedAmountDue,
    currency,
    effectiveDate,
    effectiveNow,
  };
}

/**
 * Execute a plan change (upgrade or downgrade).
 *
 * Upgrade flow:
 *   stripe.subscriptions.update() → webhook fires → activateSubscription() with delta credits
 *
 * Downgrade flow:
 *   stripe.subscriptionSchedules.create() → schedule price change at period end
 *   → webhook fires at renewal → activateSubscription() with new plan credits
 */
export async function changePlan(
  userId: string,
  targetPlanId: string,
): Promise<{
  success: boolean;
  isUpgrade: boolean;
  scheduledDate: string | null;
  portalUrl: string | null;
}> {
  const { subscription, plan: currentPlan } = await getSubscription(userId);
  if (!subscription || !currentPlan) {
    throw new NotFoundError('Active subscription');
  }
  if (!subscription.stripeSubscriptionId || !subscription.stripeCustomerId) {
    throw new ValidationError({ subscription: ['No Stripe subscription to change.'] });
  }

  const targetPlan = await getPlanById(targetPlanId);

  if (targetPlan.id === currentPlan.id) {
    throw new ValidationError({ targetPlanId: ['Already on this plan.'] });
  }
  if (targetPlan.name === 'free') {
    throw new ValidationError({ targetPlanId: ['Use cancel to revert to free tier.'] });
  }
  if (subscription.status === 'past_due') {
    throw new ValidationError({ subscription: ['Resolve outstanding payment first.'] });
  }

  const isUpgrade = targetPlan.sortOrder > currentPlan.sortOrder;
  const targetPriceId = await stripeService.getPriceIdForPlan(targetPlan.name);

  if (isUpgrade) {
    // Immediate upgrade via subscriptions.update()
    try {
      await stripeService.updateSubscriptionPrice(subscription.stripeSubscriptionId, targetPriceId);
    } catch (error: unknown) {
      // Handle card decline: return portal URL for payment method update
      const stripeErr = error as { type?: string; code?: string };
      if (stripeErr.type === 'StripeCardError' || stripeErr.code === 'card_declined') {
        const portalUrl = await stripeService.createPortalSession(
          subscription.stripeCustomerId,
          'https://spresso.xyz/settings/billing',
        );
        return {
          success: false,
          isUpgrade: true,
          scheduledDate: null,
          portalUrl,
        };
      }
      throw error;
    }

    // Webhook will handle credit allocation via activateSubscription()
    return { success: true, isUpgrade: true, scheduledDate: null, portalUrl: null };
  } else {
    // Deferred downgrade via Stripe Subscription Schedules
    const { scheduledDate } = await stripeService.scheduleDowngrade(
      subscription.stripeSubscriptionId,
      targetPriceId,
    );

    // Send downgrade scheduled email immediately (webhook fires later at renewal)
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (user) {
      sendBillingEmail(user.email, 'subscription_downgraded', {
        userName: user.name,
        userEmail: user.email,
        planName: targetPlan.displayName,
        previousPlan: currentPlan.displayName,
        creditsAllocated: String(targetPlan.creditsPerMonth),
        effectiveDate: new Date(scheduledDate * 1000).toLocaleDateString(),
        appName: 'Spresso Data Studio',
        appUrl: 'https://spresso.xyz',
      });
    }

    return {
      success: true,
      isUpgrade: false,
      scheduledDate: new Date(scheduledDate * 1000).toISOString(),
      portalUrl: null,
    };
  }
}

/**
 * Apply a retention offer (coupon) to keep user on current plan instead of downgrading.
 */
export async function applyRetentionOffer(
  userId: string,
  couponId: string,
): Promise<{ success: boolean; message: string }> {
  const { subscription } = await getSubscription(userId);
  if (!subscription?.stripeSubscriptionId) {
    throw new NotFoundError('Active subscription');
  }

  await stripeService.applyCoupon(subscription.stripeSubscriptionId, couponId);

  logger.info({ userId, couponId }, 'Retention offer accepted');

  return {
    success: true,
    message: 'Discount applied to your subscription.',
  };
}

// ---------------------------------------------------------------------------
// Seed default plans
// ---------------------------------------------------------------------------

/**
 * Seed default subscription plans if none exist.
 */
export async function seedDefaultPlans(): Promise<void> {
  const existing = await db.query.subscriptionPlans.findFirst();

  if (existing) {
    // Sync prices on existing plans
    const priceMap: Record<string, number> = { creator: 2900, business: 9900 };
    for (const [name, cents] of Object.entries(priceMap)) {
      await db
        .update(schema.subscriptionPlans)
        .set({ priceCents: cents, updatedAt: new Date() })
        .where(eq(schema.subscriptionPlans.name, name));
    }
    return;
  }

  await db.insert(schema.subscriptionPlans).values([
    {
      name: 'free',
      displayName: 'Free',
      priceCents: 0,
      creditsPerMonth: 1500,
      sortOrder: 0,
      features: [
        '1,500 AI credits/month',
        'Standard & Lite models',
        'Social media publishing',
        'Content repurposing',
        'Community support',
      ],
    },
    {
      name: 'creator',
      displayName: 'Creator',
      priceCents: 2900,
      creditsPerMonth: 8000,
      sortOrder: 1,
      features: [
        '8,000 AI credits/month',
        'Everything in Free, plus:',
        'Premium AI models (Opus, GPT-5.4)',
        'Priority support',
        'Advanced analytics',
      ],
    },
    {
      name: 'business',
      displayName: 'Business',
      priceCents: 9900,
      creditsPerMonth: 20000,
      sortOrder: 2,
      features: [
        '20,000 AI credits/month',
        'Everything in Creator, plus:',
        'Unlimited premium models',
        'Priority support',
        'Custom workflows',
      ],
    },
  ]);

  logger.info('Default subscription plans seeded');
}

// ---------------------------------------------------------------------------
// Create free subscription for new users
// ---------------------------------------------------------------------------

/**
 * Create a free-tier subscription for a newly registered user.
 */
export async function createFreeSubscription(userId: string): Promise<void> {
  // Check if already has a subscription
  const existing = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  });
  if (existing) return;

  // Get the free plan
  let freePlan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.name, 'free'),
  });

  if (!freePlan) {
    await seedDefaultPlans();
    freePlan = await db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.name, 'free'),
    });
  }

  if (!freePlan) {
    logger.error('Could not find or create free plan');
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId: freePlan.id,
      status: 'active',
      creditsRemaining: freePlan.creditsPerMonth,
      creditsAllocated: freePlan.creditsPerMonth,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .returning();

  await db.insert(schema.creditTransactions).values({
    userId,
    subscriptionId: sub.id,
    amount: freePlan.creditsPerMonth,
    balanceAfter: freePlan.creditsPerMonth,
    actionType: 'allocation',
    description: 'Free tier activation',
  });

  logger.info({ userId }, 'Free subscription created');
}
