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
  prices: Record<string, string>; // plan name → Stripe Price ID (e.g. { pro: 'price_...', ultra: 'price_...' })
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
