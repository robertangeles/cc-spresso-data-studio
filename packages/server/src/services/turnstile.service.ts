import { logger } from '../config/logger.js';
import { getSetting } from './admin.service.js';
import { CaptchaError } from '../utils/errors.js';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Behaviour:
 * - If token is invalid (Cloudflare returns success: false) → throw CaptchaError
 * - If Cloudflare is unreachable (network error) → log and allow (graceful degradation)
 * - If Turnstile is not configured in admin settings → log and allow (feature not enabled)
 */
export async function verify(token: string, ip?: string): Promise<void> {
  const setting = await getSetting('turnstile');
  if (!setting) {
    logger.warn('Turnstile not configured — skipping CAPTCHA verification');
    return;
  }

  const { secretKey } = JSON.parse(setting.value) as { secretKey?: string; siteKey?: string };
  if (!secretKey) {
    logger.warn('Turnstile secret key not set — skipping CAPTCHA verification');
    return;
  }

  if (!token) {
    throw new CaptchaError('CAPTCHA token is required. Please complete the CAPTCHA challenge.');
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
    });
    if (ip) body.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });

    const data = (await res.json()) as TurnstileResponse;

    if (!data.success) {
      logger.info(
        { errorCodes: data['error-codes'], ip },
        'Turnstile verification failed — invalid token',
      );
      throw new CaptchaError('CAPTCHA verification failed. Please refresh and try again.');
    }

    logger.debug({ ip, hostname: data.hostname }, 'Turnstile verification passed');
  } catch (err) {
    if (err instanceof CaptchaError) throw err;

    // Graceful degradation: if Cloudflare is unreachable, allow the request
    logger.error(
      { err, ip },
      'Turnstile API unreachable — allowing request (graceful degradation)',
    );
  }
}
