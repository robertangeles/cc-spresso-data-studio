import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import * as stripeService from './stripe.service.js';
import { sendBillingEmail } from './emailTemplate.service.js';
import { NotFoundError } from '../utils/errors.js';

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
    // Update existing subscription (upgrade/reactivation)
    await db
      .update(schema.subscriptions)
      .set({
        planId: plan.id,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'active',
        creditsRemaining: plan.creditsPerMonth,
        creditsAllocated: plan.creditsPerMonth,
        currentPeriodStart,
        currentPeriodEnd,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, existing.id));

    // Log credit allocation
    await db.insert(schema.creditTransactions).values({
      userId,
      subscriptionId: existing.id,
      amount: plan.creditsPerMonth,
      balanceAfter: plan.creditsPerMonth,
      actionType: 'allocation',
      description: `Subscription activated: ${plan.displayName}`,
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
            appName: 'Spresso',
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
          await activateSubscription(
            subscription.userId,
            stripeSub.id,
            priceId,
            stripeSub.customer as string,
            new Date(updatedItem.current_period_start * 1000),
            new Date(updatedItem.current_period_end * 1000),
          );

          // Send plan change email
          const upgradeUser = await db.query.users.findFirst({
            where: eq(schema.users.id, subscription.userId),
          });
          if (upgradeUser) {
            sendBillingEmail(upgradeUser.email, 'subscription_upgraded', {
              userName: upgradeUser.name,
              userEmail: upgradeUser.email,
              planName: newPlan.displayName,
              creditsAllocated: String(newPlan.creditsPerMonth),
              appName: 'Spresso',
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
              appName: 'Spresso',
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

          // Send payment confirmation email
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
                appName: 'Spresso',
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
              appName: 'Spresso',
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
// Seed default plans
// ---------------------------------------------------------------------------

/**
 * Seed default subscription plans if none exist.
 */
export async function seedDefaultPlans(): Promise<void> {
  const existing = await db.query.subscriptionPlans.findFirst();

  if (existing) {
    // Sync prices on existing plans
    const priceMap: Record<string, number> = { pro: 2900, ultra: 9900 };
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
      name: 'pro',
      displayName: 'Pro',
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
      name: 'ultra',
      displayName: 'Ultra',
      priceCents: 9900,
      creditsPerMonth: 20000,
      sortOrder: 2,
      features: [
        '20,000 AI credits/month',
        'Everything in Pro, plus:',
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
