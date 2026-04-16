import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import { sendEmail } from './email.service.js';
import { NotFoundError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<Array<typeof schema.emailTemplates.$inferSelect>> {
  return await db.query.emailTemplates.findMany({
    orderBy: (t, { asc }) => [asc(t.eventType)],
  });
}

export async function getTemplate(
  eventType: string,
): Promise<typeof schema.emailTemplates.$inferSelect> {
  const template = await db.query.emailTemplates.findFirst({
    where: eq(schema.emailTemplates.eventType, eventType),
  });
  if (!template) throw new NotFoundError(`Email template: ${eventType}`);
  return template;
}

export async function updateTemplate(
  eventType: string,
  data: { subject?: string; bodyHtml?: string; bodyText?: string; isActive?: boolean },
): Promise<typeof schema.emailTemplates.$inferSelect | undefined> {
  const [updated] = await db
    .update(schema.emailTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.emailTemplates.eventType, eventType))
    .returning();

  return updated;
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/**
 * Render a template by replacing {{variable}} placeholders with values.
 * Sanitizes values to prevent XSS.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) return match; // Leave unmatched placeholders
    return escapeHtml(value);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Send billing email
// ---------------------------------------------------------------------------

/**
 * Send a billing-related email using the template system.
 * Falls back to a basic text email if template is missing or rendering fails.
 */
export async function sendBillingEmail(
  to: string,
  eventType: string,
  variables: Record<string, string>,
): Promise<void> {
  try {
    const template = await getTemplate(eventType).catch(() => null);

    if (!template || !template.isActive) {
      logger.info({ eventType, to }, 'Email template not found or disabled, skipping');
      return;
    }

    const subject = renderTemplate(template.subject, variables);
    const html = renderTemplate(template.bodyHtml, variables);
    const text = renderTemplate(template.bodyText, variables);

    await sendEmail(to, subject, html, text);

    logger.info({ eventType, to }, 'Billing email sent');
  } catch (err) {
    logger.error(
      { eventType, to, error: err instanceof Error ? err.message : String(err) },
      'Failed to send billing email',
    );
    // Don't throw — email failure shouldn't block billing operations
  }
}

// ---------------------------------------------------------------------------
// Preview (admin)
// ---------------------------------------------------------------------------

/**
 * Render a template preview with sample data.
 */
export function previewTemplate(
  subject: string,
  bodyHtml: string,
  bodyText: string,
): { subject: string; html: string; text: string } {
  const sampleVars: Record<string, string> = {
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
    appName: 'Spresso Data Studio',
    appUrl: 'https://spresso.xyz',
    planName: 'Pro',
    planPrice: '$30/month',
    creditsAllocated: '8,000',
    creditsRemaining: '1,247',
    usagePercent: '84%',
    invoiceAmount: '$30.00',
    invoiceDate: new Date().toLocaleDateString(),
    invoicePdfUrl: 'https://stripe.com/invoice/example',
    verificationUrl: 'https://spresso.xyz/verify?token=example',
    expiryHours: '24',
  };

  return {
    subject: renderTemplate(subject, sampleVars),
    html: renderTemplate(bodyHtml, sampleVars),
    text: renderTemplate(bodyText, sampleVars),
  };
}

// ---------------------------------------------------------------------------
// Seed defaults
// ---------------------------------------------------------------------------

export async function seedDefaultTemplates(): Promise<void> {
  const existing = await db.query.emailTemplates.findFirst();

  if (existing) {
    // Patch: add invoice_payment_failed template if missing
    const hasPaymentFailed = await db.query.emailTemplates.findFirst({
      where: eq(schema.emailTemplates.eventType, 'invoice_payment_failed'),
    });
    if (!hasPaymentFailed) {
      await db.insert(schema.emailTemplates).values({
        eventType: 'invoice_payment_failed',
        subject: 'Action required — payment failed',
        bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ef4444;">Payment Failed</h1>
  <p>Hi {{userName}},</p>
  <p>We weren't able to process your latest payment. Please update your payment method to keep your subscription active.</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="{{appUrl}}/settings/billing" style="background: linear-gradient(135deg, #ffd60a, #f59e0b); color: #000; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Update Payment Method</a>
  </p>
  <p style="color: #888; font-size: 12px;">If your payment isn't resolved, your subscription may be canceled.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
        bodyText:
          'Payment failed. Please update your payment method at {{appUrl}}/settings/billing to keep your subscription active.',
        variables: ['userName', 'userEmail', 'appUrl', 'appName'],
      });
      logger.info('Patched: added invoice_payment_failed email template');
    }
    return;
  }

  const defaults = [
    {
      eventType: 'subscription_welcome',
      subject: 'Welcome to Spresso Data Studio {{planName}}!',
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ffd60a; margin-bottom: 8px;">Welcome to Spresso Data Studio {{planName}}!</h1>
  <p>Hi {{userName}},</p>
  <p>Your {{planName}} subscription is now active. You have <strong style="color: #ffd60a;">{{creditsAllocated}} credits</strong> to use this month.</p>
  <p>Start creating amazing content at <a href="{{appUrl}}" style="color: #ffd60a;">{{appUrl}}</a></p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        'Welcome to Spresso Data Studio {{planName}}! Hi {{userName}}, your subscription is active with {{creditsAllocated}} credits. Visit {{appUrl}} to get started.',
      variables: ['userName', 'userEmail', 'planName', 'creditsAllocated', 'appUrl', 'appName'],
    },
    {
      eventType: 'subscription_upgraded',
      subject: "You've upgraded to {{planName}}!",
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ffd60a;">Upgrade Complete!</h1>
  <p>Hi {{userName}},</p>
  <p>You're now on the <strong style="color: #ffd60a;">{{planName}}</strong> plan. Your credits have been refreshed to <strong>{{creditsAllocated}}</strong>.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        "You've upgraded to {{planName}}! Hi {{userName}}, your credits have been refreshed to {{creditsAllocated}}.",
      variables: ['userName', 'planName', 'creditsAllocated', 'appUrl'],
    },
    {
      eventType: 'subscription_canceled',
      subject: 'Your Spresso Data Studio subscription has been canceled',
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ffd60a;">Subscription Canceled</h1>
  <p>Hi {{userName}},</p>
  <p>Your {{planName}} subscription has been canceled. You'll retain access until the end of your current billing period.</p>
  <p>We'd love to have you back. Visit <a href="{{appUrl}}/pricing" style="color: #ffd60a;">{{appUrl}}/pricing</a> anytime to resubscribe.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        'Your {{planName}} subscription has been canceled. You retain access until the end of your billing period. Visit {{appUrl}}/pricing to resubscribe.',
      variables: ['userName', 'planName', 'appUrl'],
    },
    {
      eventType: 'credits_low',
      subject: "You're running low on credits",
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #f59e0b;">Credits Running Low</h1>
  <p>Hi {{userName}},</p>
  <p>You have <strong style="color: #f59e0b;">{{creditsRemaining}}</strong> of {{creditsAllocated}} credits remaining ({{usagePercent}} used).</p>
  <p>Upgrade your plan to get more credits: <a href="{{appUrl}}/pricing" style="color: #ffd60a;">View Plans</a></p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        "You're running low on credits. {{creditsRemaining}} of {{creditsAllocated}} remaining ({{usagePercent}} used). Upgrade at {{appUrl}}/pricing",
      variables: ['userName', 'creditsRemaining', 'creditsAllocated', 'usagePercent', 'appUrl'],
    },
    {
      eventType: 'credits_exhausted',
      subject: "You've used all your credits this month",
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ef4444;">Credits Exhausted</h1>
  <p>Hi {{userName}},</p>
  <p>You've used all {{creditsAllocated}} credits for this billing period. Upgrade to continue creating: <a href="{{appUrl}}/pricing" style="color: #ffd60a;">Upgrade Now</a></p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        "You've used all {{creditsAllocated}} credits. Upgrade at {{appUrl}}/pricing to continue creating.",
      variables: ['userName', 'creditsAllocated', 'appUrl'],
    },
    {
      eventType: 'invoice_paid',
      subject: 'Payment received — {{invoiceAmount}}',
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #22c55e;">Payment Received</h1>
  <p>Hi {{userName}},</p>
  <p>We received your payment of <strong>{{invoiceAmount}}</strong> on {{invoiceDate}}.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText: 'Payment of {{invoiceAmount}} received on {{invoiceDate}}. Thank you!',
      variables: ['userName', 'invoiceAmount', 'invoiceDate', 'invoicePdfUrl'],
    },
    {
      eventType: 'invoice_payment_failed',
      subject: 'Action required — payment failed',
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ef4444;">Payment Failed</h1>
  <p>Hi {{userName}},</p>
  <p>We weren't able to process your latest payment. Please update your payment method to keep your subscription active.</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="{{appUrl}}/settings/billing" style="background: linear-gradient(135deg, #ffd60a, #f59e0b); color: #000; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Update Payment Method</a>
  </p>
  <p style="color: #888; font-size: 12px;">If your payment isn't resolved, your subscription may be canceled.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        'Payment failed. Please update your payment method at {{appUrl}}/settings/billing to keep your subscription active.',
      variables: ['userName', 'userEmail', 'appUrl', 'appName'],
    },
    {
      eventType: 'email_verification',
      subject: 'Verify your Spresso Data Studio account',
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 40px; border-radius: 12px;">
  <h1 style="color: #ffd60a;">Verify Your Email</h1>
  <p>Hi {{userName}},</p>
  <p>Click the button below to verify your email address:</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="{{verificationUrl}}" style="background: linear-gradient(135deg, #ffd60a, #f59e0b); color: #000; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Verify Email</a>
  </p>
  <p style="color: #888; font-size: 12px;">This link expires in {{expiryHours}} hours. If you didn't create an account, ignore this email.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Spresso Data Studio Team</p>
</div>`,
      bodyText:
        'Verify your email: {{verificationUrl}} — This link expires in {{expiryHours}} hours.',
      variables: ['userName', 'userEmail', 'verificationUrl', 'expiryHours', 'appUrl'],
    },
  ];

  await db.insert(schema.emailTemplates).values(defaults);
  logger.info('Default email templates seeded');
}
