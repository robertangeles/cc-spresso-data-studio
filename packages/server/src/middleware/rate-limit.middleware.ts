import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authentication endpoints (register + login).
 * Production default: 5 requests per 15 minutes per IP.
 * Non-production default: 100 per 15 minutes — keeps the limiter wired
 * (so misconfigurations are caught) but doesn't block local dev / E2E
 * suites that legitimately log in many times.
 * Override either default via `AUTH_RATE_LIMIT_MAX` /
 * `AUTH_RATE_LIMIT_WINDOW_MIN` env vars.
 */
const isProd = process.env.NODE_ENV === 'production';
const AUTH_LIMIT_WINDOW_MIN = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MIN ?? 15);
const AUTH_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX ?? (isProd ? 5 : 100));
export const authLimiter = rateLimit({
  windowMs: AUTH_LIMIT_WINDOW_MIN * 60 * 1000,
  max: AUTH_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: `Too many authentication attempts. Please try again in ${AUTH_LIMIT_WINDOW_MIN} minutes.`,
    statusCode: 429,
  },
});

/**
 * Rate limiter for verification email resend.
 * 3 requests per 15 minutes per IP.
 */
export const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many resend requests. Please try again later.',
    statusCode: 429,
  },
});

/**
 * General API rate limiter.
 * 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
    statusCode: 429,
  },
});
