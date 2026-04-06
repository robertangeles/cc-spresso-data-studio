import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import * as subscriptionService from '../services/subscription.service.js';
import * as creditService from '../services/credit.service.js'; // used by adjustCredits, listCreditCosts, updateCreditCost, listPlans
import * as stripeService from '../services/stripe.service.js';
import * as adminService from '../services/admin.service.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Plans (public)
// ---------------------------------------------------------------------------

export async function listPlans(
  _req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const plans = await subscriptionService.listPlans();

    // Also fetch credit costs for the pricing page
    const creditCosts = await creditService.listCreditCosts();

    res.json({
      success: true,
      data: {
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          displayName: p.displayName,
          priceCents: p.priceCents,
          currency: p.currency,
          creditsPerMonth: p.creditsPerMonth,
          features: p.features,
          sortOrder: p.sortOrder,
        })),
        creditCosts: creditCosts.map((c) => ({
          actionType: c.actionType,
          displayName: c.displayName,
          baseCost: c.baseCost,
          premiumMultiplier: c.premiumMultiplier,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Subscription (authenticated)
// ---------------------------------------------------------------------------

export async function getSubscription(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { subscription, plan } = await subscriptionService.getSubscription(req.user.userId);

    // Return immediately — no Stripe API calls here
    res.json({
      success: true,
      data: {
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              creditsRemaining: subscription.creditsRemaining,
              creditsAllocated: subscription.creditsAllocated,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              canceledAt: subscription.canceledAt,
            }
          : null,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              displayName: plan.displayName,
              priceCents: plan.priceCents,
              creditsPerMonth: plan.creditsPerMonth,
              features: plan.features,
              sortOrder: plan.sortOrder,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Pending schedule (lazy-loaded, non-blocking Stripe call)
// ---------------------------------------------------------------------------

export async function getPendingSchedule(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { subscription, plan } = await subscriptionService.getSubscription(req.user.userId);

    if (!subscription?.stripeSubscriptionId) {
      res.json({ success: true, data: { pendingDowngrade: null } });
      return;
    }

    const schedule = await stripeService.getPendingSchedule(subscription.stripeSubscriptionId);
    let pendingDowngrade: { planName: string; effectiveDate: string } | null = null;

    if (schedule) {
      const scheduledPlan = await subscriptionService.getPlanByStripePriceId(
        schedule.scheduledPriceId,
      );
      if (scheduledPlan && plan && scheduledPlan.sortOrder < plan.sortOrder) {
        pendingDowngrade = {
          planName: scheduledPlan.displayName,
          effectiveDate: new Date(schedule.scheduledDate * 1000).toISOString(),
        };
      }
    }

    res.json({ success: true, data: { pendingDowngrade } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Usage breakdown (authenticated)
// ---------------------------------------------------------------------------

export async function getUsage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    // Get current subscription to determine period
    const { subscription } = await subscriptionService.getSubscription(req.user.userId);

    const periodStart = subscription?.currentPeriodStart ?? new Date(0);
    const periodEnd = subscription?.currentPeriodEnd ?? new Date();

    const breakdown = await creditService.getUsageBreakdown(
      req.user.userId,
      periodStart,
      periodEnd,
    );

    const history = await creditService.getTransactionHistory(
      req.user.userId,
      parseInt(req.query.limit as string) || 50,
      parseInt(req.query.offset as string) || 0,
    );

    res.json({
      success: true,
      data: { breakdown, history },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Checkout (authenticated)
// ---------------------------------------------------------------------------

export async function createCheckout(
  req: Request,
  res: Response<ApiResponse<{ url: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { planId } = req.body;
    if (!planId) {
      throw new ValidationError({ planId: ['Plan ID is required'] });
    }

    const successUrl = `${req.headers.origin || req.protocol + '://' + req.get('host')}/chat?subscription=success`;
    const cancelUrl = `${req.headers.origin || req.protocol + '://' + req.get('host')}/pricing?canceled=true`;

    const url = await subscriptionService.createCheckout(
      req.user.userId,
      planId,
      successUrl,
      cancelUrl,
    );

    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Customer Portal (authenticated)
// ---------------------------------------------------------------------------

export async function createPortal(
  req: Request,
  res: Response<ApiResponse<{ url: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { subscription } = await subscriptionService.getSubscription(req.user.userId);

    if (!subscription?.stripeCustomerId) {
      throw new ValidationError({
        subscription: ['No active subscription found'],
      });
    }

    const returnUrl = `${req.headers.origin || req.protocol + '://' + req.get('host')}/settings/billing`;

    const url = await stripeService.createPortalSession(subscription.stripeCustomerId, returnUrl);

    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Cancel (authenticated)
// ---------------------------------------------------------------------------

export async function cancelSubscription(
  req: Request,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    await subscriptionService.cancelSubscription(req.user.userId);

    res.json({
      success: true,
      data: { message: 'Subscription will cancel at the end of the current billing period.' },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Invoices (authenticated)
// ---------------------------------------------------------------------------

export async function getInvoices(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { subscription } = await subscriptionService.getSubscription(req.user.userId);

    if (!subscription?.stripeCustomerId) {
      // No Stripe customer — return empty list
      res.json({ success: true, data: { invoices: [] } });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const invoices = await stripeService.listInvoices(subscription.stripeCustomerId, limit);

    res.json({ success: true, data: { invoices } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Plan change: preview + execute (authenticated)
// ---------------------------------------------------------------------------

export async function previewPlanChange(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { targetPlanId } = req.body;
    if (!targetPlanId) {
      throw new ValidationError({ targetPlanId: ['Target plan ID is required'] });
    }

    const preview = await subscriptionService.previewPlanChange(req.user.userId, targetPlanId);
    res.json({ success: true, data: preview });
  } catch (err) {
    next(err);
  }
}

export async function changePlan(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { targetPlanId, retention, couponId } = req.body;
    if (!targetPlanId && !retention) {
      throw new ValidationError({ targetPlanId: ['Target plan ID is required'] });
    }

    // Handle retention offer acceptance
    if (retention && couponId) {
      const result = await subscriptionService.applyRetentionOffer(req.user.userId, couponId);
      res.json({ success: true, data: result });
      return;
    }

    const result = await subscriptionService.changePlan(req.user.userId, targetPlanId);

    if (!result.success && result.portalUrl) {
      // Payment failed — return portal URL for card update
      res.status(402).json({
        success: false,
        error: 'Payment failed. Please update your payment method.',
        data: { portalUrl: result.portalUrl },
      } as ApiResponse<unknown>);
      return;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getForecast(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const forecast = await creditService.getCreditForecast(req.user.userId);
    res.json({ success: true, data: forecast });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Webhook (no auth — signature verified)
// ---------------------------------------------------------------------------

export async function handleWebhook(req: Request, res: Response, _next: NextFunction) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      res.status(400).json({ success: false, error: 'Missing stripe-signature header' });
      return;
    }

    const event = await stripeService.constructWebhookEvent(req.body as Buffer, signature);

    // Process asynchronously — return 200 immediately to Stripe
    subscriptionService.handleWebhookEvent(event).catch((err) => {
      logger.error(
        { eventId: event.id, error: err instanceof Error ? err.message : String(err) },
        'Async webhook processing failed',
      );
    });

    res.json({ received: true });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Webhook handler error',
    );
    res.status(400).json({ success: false, error: 'Webhook verification failed' });
  }
}

// ---------------------------------------------------------------------------
// Admin: Credit adjustment
// ---------------------------------------------------------------------------

export async function adjustCredits(
  req: Request,
  res: Response<ApiResponse<{ newBalance: number }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { userId, amount, reason } = req.body;
    if (!userId || amount === undefined || !reason) {
      throw new ValidationError({
        body: ['userId, amount, and reason are required'],
      });
    }

    const result = await creditService.adjustCredits(userId, amount, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Admin: Credit costs
// ---------------------------------------------------------------------------

export async function listCreditCosts(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const costs = await creditService.listCreditCosts();
    res.json({ success: true, data: costs });
  } catch (err) {
    next(err);
  }
}

export async function updateCreditCost(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const updated = await creditService.updateCreditCost(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Admin: Stripe config
// ---------------------------------------------------------------------------

export async function getStripeConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const settings = await stripeService.getStripeSettings().catch(() => null);

    const emptyKeySet = { secretKey: '', publishableKey: '', webhookSecret: '', prices: {} };

    if (!settings) {
      res.json({
        success: true,
        data: {
          configured: false,
          mode: 'test',
          test: emptyKeySet,
          live: emptyKeySet,
        },
      });
      return;
    }

    const maskKey = (key: string) =>
      key.length > 8 ? key.slice(0, 7) + '••••' + key.slice(-4) : key ? '••••••••' : '';

    const activeKeys = settings[settings.mode];
    const configured = !!(
      activeKeys.secretKey &&
      activeKeys.publishableKey &&
      activeKeys.webhookSecret
    );

    res.json({
      success: true,
      data: {
        configured,
        mode: settings.mode,
        test: {
          secretKey: maskKey(settings.test.secretKey),
          publishableKey: maskKey(settings.test.publishableKey),
          webhookSecret: maskKey(settings.test.webhookSecret),
          prices: settings.test.prices || {},
        },
        live: {
          secretKey: maskKey(settings.live.secretKey),
          publishableKey: maskKey(settings.live.publishableKey),
          webhookSecret: maskKey(settings.live.webhookSecret),
          prices: settings.live.prices || {},
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateStripeConfig(
  req: Request,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { mode, test, live } = req.body;

    if (!mode || !['test', 'live'].includes(mode)) {
      throw new ValidationError({
        mode: ['Mode must be "test" or "live"'],
      });
    }

    // Merge with existing settings so updating one mode doesn't wipe the other.
    // Ignore masked values (contain ••••) — those are display-only from GET.
    const existing = await stripeService.getStripeSettings().catch(() => null);
    const isReal = (val: string | undefined) => val && !val.includes('••••');

    const settings = {
      mode,
      test: {
        secretKey: isReal(test?.secretKey) ? test.secretKey : existing?.test?.secretKey || '',
        publishableKey: isReal(test?.publishableKey)
          ? test.publishableKey
          : existing?.test?.publishableKey || '',
        webhookSecret: isReal(test?.webhookSecret)
          ? test.webhookSecret
          : existing?.test?.webhookSecret || '',
        prices: test?.prices ?? existing?.test?.prices ?? {},
      },
      live: {
        secretKey: isReal(live?.secretKey) ? live.secretKey : existing?.live?.secretKey || '',
        publishableKey: isReal(live?.publishableKey)
          ? live.publishableKey
          : existing?.live?.publishableKey || '',
        webhookSecret: isReal(live?.webhookSecret)
          ? live.webhookSecret
          : existing?.live?.webhookSecret || '',
        prices: live?.prices ?? existing?.live?.prices ?? {},
      },
    };

    await adminService.updateSetting('stripe', JSON.stringify(settings), true);

    stripeService.invalidateStripeConfig();

    res.json({ success: true, data: { message: `Stripe configuration updated (${mode} mode)` } });
  } catch (err) {
    next(err);
  }
}

export async function testStripeConnection(
  req: Request,
  res: Response<ApiResponse<{ connected: boolean }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await stripeService.testConnection();
    res.json({ success: true, data: { connected: true } });
  } catch (err) {
    next(err);
  }
}
