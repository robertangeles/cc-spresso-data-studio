import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StripeKeySet {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  prices: Record<string, string>; // plan name → Stripe Price ID (e.g. { creator: 'price_...', business: 'price_...' })
}

export type StripeMode = 'test' | 'live';

export interface StripeSettings {
  mode: StripeMode;
  test: StripeKeySet;
  live: StripeKeySet;
}

// Active config resolved from the current mode
interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedStripe: Stripe | null = null;
let cachedConfig: StripeConfig | null = null;
let cachedSettings: StripeSettings | null = null;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Fetch full Stripe settings (both key sets + mode) from the DB.
 */
export async function getStripeSettings(): Promise<StripeSettings> {
  if (cachedSettings) return cachedSettings;

  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, 'stripe'),
  });

  if (!row?.value) {
    throw new Error(
      'Stripe is not configured. Go to Settings > Integrations > Stripe to configure.',
    );
  }

  const parsed = JSON.parse(row.value);

  // Support legacy flat format (secretKey, publishableKey, webhookSecret)
  if (!parsed.mode) {
    const legacy: StripeSettings = {
      mode: parsed.secretKey?.startsWith('sk_test_') ? 'test' : 'live',
      test: { secretKey: '', publishableKey: '', webhookSecret: '', prices: {} },
      live: { secretKey: '', publishableKey: '', webhookSecret: '', prices: {} },
    };
    const target = legacy.mode;
    legacy[target] = {
      secretKey: parsed.secretKey || '',
      publishableKey: parsed.publishableKey || '',
      webhookSecret: parsed.webhookSecret || '',
      prices: {},
    };
    cachedSettings = legacy;
    return cachedSettings;
  }

  cachedSettings = parsed as StripeSettings;
  return cachedSettings;
}

/**
 * Fetch Stripe configuration for the currently active mode.
 * Results are cached until `invalidateStripeConfig()` is called.
 */
export async function getStripeConfig(): Promise<StripeConfig> {
  if (cachedConfig) return cachedConfig;

  const settings = await getStripeSettings();
  const keys = settings[settings.mode];

  if (!keys.secretKey || !keys.publishableKey || !keys.webhookSecret) {
    throw new Error(
      `Stripe ${settings.mode} configuration is incomplete. Ensure secretKey, publishableKey, and webhookSecret are all set for ${settings.mode} mode.`,
    );
  }

  cachedConfig = keys;
  return cachedConfig;
}

/**
 * Get the Stripe Price ID for a given plan name in the current mode.
 */
export async function getPriceIdForPlan(planName: string): Promise<string> {
  const settings = await getStripeSettings();
  const priceId = settings[settings.mode].prices[planName];
  if (!priceId) {
    throw new Error(
      `No Stripe Price ID configured for plan "${planName}" in ${settings.mode} mode. Configure it in Settings > Stripe.`,
    );
  }
  return priceId;
}

/**
 * Reverse-lookup: find which plan name a Stripe Price ID belongs to in the current mode.
 */
export async function getPlanNameByPriceId(priceId: string): Promise<string | null> {
  const settings = await getStripeSettings();
  const prices = settings[settings.mode].prices;
  for (const [name, id] of Object.entries(prices)) {
    if (id === priceId) return name;
  }
  return null;
}

/**
 * Lazy-initialise and return a Stripe SDK instance using the DB config.
 * The instance is cached until `invalidateStripeConfig()` is called.
 */
export async function getStripe(): Promise<Stripe> {
  if (cachedStripe) return cachedStripe;

  const config = await getStripeConfig();
  cachedStripe = new Stripe(config.secretKey);
  return cachedStripe;
}

/**
 * Clear both the config and SDK caches.
 * Call this whenever the admin updates Stripe settings.
 */
export function invalidateStripeConfig(): void {
  cachedStripe = null;
  cachedConfig = null;
  cachedSettings = null;
  logger.info('Stripe config cache invalidated');
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

/**
 * Create a Stripe customer and return the customer ID.
 */
export async function createCustomer(email: string, name: string, userId: string): Promise<string> {
  try {
    const stripe = await getStripe();
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });
    logger.info({ customerId: customer.id, userId }, 'Stripe customer created');
    return customer.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userId }, 'Failed to create Stripe customer');
    throw new Error(`Failed to create Stripe customer: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

interface CheckoutParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
}

/**
 * Create a Stripe Checkout Session and return the session URL.
 */
export async function createCheckoutSession(params: CheckoutParams): Promise<string> {
  const { customerId, priceId, successUrl, cancelUrl, userId } = params;

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    if (!session.url) {
      throw new Error('Stripe returned a session without a URL');
    }

    logger.info({ sessionId: session.id, userId }, 'Checkout session created');
    return session.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userId }, 'Failed to create checkout session');
    throw new Error(`Failed to create checkout session: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Customer Portal
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session and return the URL.
 */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  try {
    const stripe = await getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    logger.info({ customerId }, 'Portal session created');
    return session.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, customerId }, 'Failed to create portal session');
    throw new Error(`Failed to create portal session: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Verify a Stripe webhook signature and return the parsed event.
 */
export async function constructWebhookEvent(
  payload: Buffer,
  signature: string,
): Promise<Stripe.Event> {
  try {
    const stripe = await getStripe();
    const config = await getStripeConfig();
    const event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
    return event;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Webhook signature verification failed');
    throw new Error(`Webhook signature verification failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

/**
 * Cancel a subscription at the end of the current billing period.
 */
export async function cancelSubscription(
  stripeSubscriptionId: string,
): Promise<Stripe.Subscription> {
  try {
    const stripe = await getStripe();
    const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    logger.info({ stripeSubscriptionId }, 'Subscription set to cancel at period end');
    return subscription;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, stripeSubscriptionId }, 'Failed to cancel subscription');
    throw new Error(`Failed to cancel subscription: ${message}`);
  }
}

/**
 * Retrieve subscription details from Stripe.
 */
export async function getSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const stripe = await getStripe();
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, stripeSubscriptionId }, 'Failed to retrieve subscription');
    throw new Error(`Failed to retrieve subscription: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Plan change (upgrade / downgrade)
// ---------------------------------------------------------------------------

/**
 * Preview the proration cost for changing a subscription to a new price.
 * Uses Stripe's invoice preview to show the user what they'd be charged.
 */
export async function previewInvoice(
  customerId: string,
  subscriptionId: string,
  newPriceId: string,
): Promise<{
  proratedAmountDue: number;
  currency: string;
  periodEnd: number;
}> {
  try {
    const stripe = await getStripe();

    // Get current subscription to find the item ID
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error('Subscription has no items');

    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionId,
      subscription_details: {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: 'create_prorations',
      },
    });

    // In Stripe v22, period dates are on subscription items
    const periodEnd = sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000);

    logger.info(
      { customerId, subscriptionId, newPriceId, amount: preview.amount_due },
      'Invoice preview created',
    );

    return {
      proratedAmountDue: preview.amount_due,
      currency: preview.currency,
      periodEnd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, subscriptionId }, 'Failed to preview invoice');
    throw new Error(`Failed to preview plan change: ${message}`);
  }
}

/**
 * Update a subscription's price (immediate upgrade).
 * Stripe will prorate the charge automatically.
 */
export async function updateSubscriptionPrice(
  subscriptionId: string,
  newPriceId: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  try {
    const stripe = await getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error('Subscription has no items');

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });

    logger.info({ subscriptionId, newPriceId }, 'Subscription price updated (upgrade)');
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, subscriptionId }, 'Failed to update subscription price');
    throw error; // Re-throw original for Stripe error type detection
  }
}

/**
 * Schedule a price change at the end of the current billing period (deferred downgrade).
 * Uses Stripe Subscription Schedules to change price at renewal.
 */
export async function scheduleDowngrade(
  subscriptionId: string,
  newPriceId: string,
): Promise<{ scheduledDate: number }> {
  try {
    const stripe = await getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    // In Stripe v22, period dates live on subscription items
    const firstItem = sub.items.data[0];
    const periodStart = firstItem?.current_period_start ?? Math.floor(Date.now() / 1000);
    const periodEnd = firstItem?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;

    // Create a subscription schedule from the existing subscription
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });

    // Update the schedule: current phase stays, add new phase at period end with new price
    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: [{ price: firstItem.price.id, quantity: 1 }],
          start_date: periodStart,
          end_date: periodEnd,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          start_date: periodEnd,
        },
      ],
    });

    logger.info(
      { subscriptionId, newPriceId, scheduledDate: periodEnd },
      'Downgrade scheduled at period end',
    );

    return { scheduledDate: periodEnd };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, subscriptionId }, 'Failed to schedule downgrade');
    throw new Error(`Failed to schedule downgrade: ${message}`);
  }
}

/**
 * Apply a coupon to an existing subscription (retention offer).
 */
export async function applyCoupon(
  subscriptionId: string,
  couponId: string,
): Promise<Stripe.Response<Stripe.Subscription>> {
  try {
    const stripe = await getStripe();
    const updated = await stripe.subscriptions.update(subscriptionId, {
      discounts: [{ coupon: couponId }],
    });

    logger.info({ subscriptionId, couponId }, 'Coupon applied to subscription');
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, subscriptionId, couponId }, 'Failed to apply coupon');
    throw error; // Re-throw for Stripe error type detection
  }
}

// ---------------------------------------------------------------------------
// Pending schedule check (detect scheduled downgrades)
// ---------------------------------------------------------------------------

/**
 * Check if a subscription has a pending schedule (e.g. scheduled downgrade).
 * Returns the scheduled plan price ID and date, or null if no schedule.
 */
export async function getPendingSchedule(
  subscriptionId: string,
): Promise<{ scheduledPriceId: string; scheduledDate: number } | null> {
  try {
    const stripe = await getStripe();

    // Subscription object has a `schedule` field linking to any active schedule
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (!sub.schedule) return null;

    const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id;
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);

    if (schedule.status !== 'active') return null;

    // Check if there's a future phase with a different price
    const phases = schedule.phases;
    if (phases.length < 2) return null;

    const futurePhase = phases[phases.length - 1];
    const futureItem = futurePhase.items[0];
    if (!futureItem) return null;

    const priceId = typeof futureItem.price === 'string' ? futureItem.price : futureItem.price;

    return {
      scheduledPriceId: priceId as string,
      scheduledDate: futurePhase.start_date,
    };
  } catch {
    // Schedule check is non-critical — fail silently
    return null;
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * List invoices for a Stripe customer (for in-app invoice history).
 */
export async function listInvoices(
  customerId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    date: number;
    amount: number;
    currency: string;
    status: string | null;
    description: string | null;
    hostedUrl: string | null;
    pdfUrl: string | null;
  }>
> {
  try {
    const stripe = await getStripe();
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      date: inv.created,
      amount: inv.amount_paid ?? inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      description: inv.lines.data[0]?.description ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, customerId }, 'Failed to list invoices');
    throw new Error(`Failed to list invoices: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Customer billing sync (business name + tax ID for invoices)
// ---------------------------------------------------------------------------

/**
 * Sync business name and tax ID to a Stripe customer.
 * - Updates customer name to brandName (or falls back to user name)
 * - Creates a tax ID on the customer (Stripe displays it on invoices)
 */
export async function syncCustomerBilling(
  customerId: string,
  displayName: string,
  taxId?: string | null,
  taxIdType?: string | null,
): Promise<void> {
  try {
    const stripe = await getStripe();

    // Update customer name (shows on invoices)
    await stripe.customers.update(customerId, {
      name: displayName,
    });

    // Set tax ID if provided
    if (taxId && taxIdType) {
      // List existing tax IDs to avoid duplicates
      const existing = await stripe.customers.listTaxIds(customerId, { limit: 10 });
      const alreadySet = existing.data.some((t) => t.type === taxIdType && t.value === taxId);

      if (!alreadySet) {
        // Remove old tax IDs of same type before adding new
        for (const t of existing.data) {
          if (t.type === taxIdType) {
            await stripe.customers.deleteTaxId(customerId, t.id);
          }
        }

        await stripe.customers.createTaxId(customerId, {
          type: taxIdType as Stripe.CustomerCreateTaxIdParams.Type,
          value: taxId,
        });
      }
    }

    logger.info({ customerId, displayName, taxIdType }, 'Customer billing info synced');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, customerId }, 'Failed to sync customer billing');
    throw new Error(`Failed to sync billing info: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

/**
 * Verify the Stripe API keys are valid by listing one customer.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const stripe = await getStripe();
    await stripe.customers.list({ limit: 1 });
    logger.info('Stripe connection test successful');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Stripe connection test failed');
    throw new Error(`Stripe connection test failed: ${message}`);
  }
}
