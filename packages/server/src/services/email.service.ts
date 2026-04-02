import { Resend } from 'resend';
import { logger } from '../config/logger.js';
import { getSetting } from './admin.service.js';
import { EmailConfigError } from '../utils/errors.js';

interface EmailConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

let resendClient: Resend | null = null;
let cachedConfig: EmailConfig | null = null;

async function getEmailConfig(): Promise<EmailConfig> {
  if (cachedConfig) return cachedConfig;

  const setting = await getSetting('resend');
  if (!setting) {
    throw new EmailConfigError(
      'Resend email service is not configured. Set it up in Settings > Integrations.',
    );
  }

  const parsed = JSON.parse(setting.value) as Partial<EmailConfig>;
  if (!parsed.apiKey) {
    throw new EmailConfigError(
      'Resend API key is missing. Configure it in Settings > Integrations.',
    );
  }

  cachedConfig = {
    apiKey: parsed.apiKey,
    fromAddress: parsed.fromAddress || 'noreply@spresso.app',
    fromName: parsed.fromName || 'Spresso',
  };
  return cachedConfig;
}

function getClient(apiKey: string): Resend {
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/** Invalidate cached config (call when admin updates settings). */
export function invalidateEmailConfig(): void {
  cachedConfig = null;
  resendClient = null;
}

/** Send a generic email via Resend. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const config = await getEmailConfig();
  const client = getClient(config.apiKey);

  const { error } = await client.emails.send({
    from: `${config.fromName} <${config.fromAddress}>`,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error({ err: error, to, subject }, 'Failed to send email via Resend');
    throw new Error(`Email send failed: ${error.message}`);
  }

  logger.info({ to: maskEmail(to), subject }, 'Email sent successfully');
}

/** Send a branded verification email. */
export async function sendVerificationEmail(
  to: string,
  name: string,
  verificationUrl: string,
): Promise<void> {
  const subject = 'Verify your Spresso account';
  const html = buildVerificationEmailHtml(name, verificationUrl);
  await sendEmail(to, subject, html);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

function buildVerificationEmailHtml(name: string, url: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141414; border-radius:12px; border:1px solid #222;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <div style="font-size:20px; font-weight:700; color:#ffd60a; letter-spacing:-0.5px;">
                ✦ Spresso
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 32px 32px;">
              <h1 style="margin:0 0 16px; font-size:22px; font-weight:600; color:#e5e5e5;">
                Verify your email
              </h1>
              <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#999;">
                Hey ${escapeHtml(name)}, thanks for signing up! Click the button below to verify your email and start creating.
              </p>
              <a href="${escapeHtml(url)}" style="display:inline-block; padding:12px 28px; background:linear-gradient(135deg,#ffd60a,#e6a800); color:#0a0a0a; font-size:14px; font-weight:600; text-decoration:none; border-radius:8px;">
                Verify my email
              </a>
              <p style="margin:24px 0 0; font-size:13px; line-height:1.5; color:#666;">
                This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; border-top:1px solid #222;">
              <p style="margin:0; font-size:12px; color:#555;">
                &copy; ${new Date().getFullYear()} Spresso &mdash; Create once. Reach everywhere.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
