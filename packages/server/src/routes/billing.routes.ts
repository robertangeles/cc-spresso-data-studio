import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as billingController from '../controllers/billing.controller.js';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

// List available plans + credit costs (pricing page)
router.get('/plans', billingController.listPlans);

// Stripe webhook (no auth — signature verified in controller)
router.post('/webhook', billingController.handleWebhook);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);

// Current subscription + balance
router.get('/subscription', billingController.getSubscription);

// Usage breakdown + transaction history
router.get('/usage', billingController.getUsage);

// Create Stripe Checkout session
router.post('/checkout', billingController.createCheckout);

// Create Stripe Customer Portal session
router.post('/portal', billingController.createPortal);

// Cancel subscription at period end
router.post('/cancel', billingController.cancelSubscription);

// ---------------------------------------------------------------------------
// Admin routes (TODO: add requireRole('Admin') when wired)
// ---------------------------------------------------------------------------

// Stripe configuration
router.get('/admin/stripe', billingController.getStripeConfig);
router.put('/admin/stripe', billingController.updateStripeConfig);
router.post('/admin/stripe/test', billingController.testStripeConnection);

// Credit costs configuration
router.get('/admin/credit-costs', billingController.listCreditCosts);
router.put('/admin/credit-costs/:id', billingController.updateCreditCost);

// Credit adjustment
router.post('/admin/credits/adjust', billingController.adjustCredits);

export { router as billingRoutes };
