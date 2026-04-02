import crypto from 'crypto';
import { eq, and, desc, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { sendVerificationEmail } from './email.service.js';
import {
  NotFoundError,
  TokenExpiredError,
  ConflictError,
  TooManyRequestsError,
} from '../utils/errors.js';

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/**
 * Generate a verification token, store its hash, and send the verification email.
 */
export async function generateAndSend(userId: string, email: string, name: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await db.insert(schema.emailVerifications).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const verificationUrl = `${config.clientUrl}/verify/${token}`;

  try {
    await sendVerificationEmail(email, name, verificationUrl);
    logger.info({ userId, email: maskEmail(email) }, 'Verification email sent');
  } catch (err) {
    // Email send failure should not block account creation.
    // User can resend later.
    logger.error(
      { err, userId, email: maskEmail(email) },
      'Failed to send verification email — user can resend',
    );
  }
}

/**
 * Verify an email token. Sets isEmailVerified = true on the user.
 * Returns the userId on success.
 */
export async function verifyToken(token: string): Promise<string> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await db.query.emailVerifications.findFirst({
    where: eq(schema.emailVerifications.tokenHash, tokenHash),
  });

  if (!record) {
    throw new NotFoundError('Verification token');
  }

  // Already verified — idempotent
  if (record.verifiedAt) {
    return record.userId;
  }

  if (record.expiresAt < new Date()) {
    throw new TokenExpiredError('This verification link has expired. Please request a new one.');
  }

  // Mark token as used and user as verified in a transaction-like sequence
  await db
    .update(schema.emailVerifications)
    .set({ verifiedAt: new Date() })
    .where(eq(schema.emailVerifications.id, record.id));

  await db
    .update(schema.users)
    .set({ isEmailVerified: true, updatedAt: new Date() })
    .where(eq(schema.users.id, record.userId));

  logger.info({ userId: record.userId }, 'Email verified successfully');

  return record.userId;
}

/**
 * Resend a verification email. Enforces a 60-second cooldown.
 */
export async function resend(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.isEmailVerified) {
    throw new ConflictError('Email is already verified.');
  }

  // Check cooldown — most recent token created_at
  const lastToken = await db.query.emailVerifications.findFirst({
    where: eq(schema.emailVerifications.userId, userId),
    orderBy: [desc(schema.emailVerifications.createdAt)],
  });

  if (lastToken) {
    const elapsed = Date.now() - lastToken.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new TooManyRequestsError(
        `Please wait ${retryAfter} seconds before requesting another email.`,
        retryAfter,
      );
    }
  }

  await generateAndSend(userId, user.email, user.name);
}

/**
 * Check whether a user's email is verified.
 */
export async function getStatus(userId: string): Promise<{ isEmailVerified: boolean }> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { isEmailVerified: true },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return { isEmailVerified: user.isEmailVerified };
}

/**
 * Delete expired verification tokens (older than 24h and unused).
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - TOKEN_EXPIRY_MS);
  const result = await db
    .delete(schema.emailVerifications)
    .where(
      and(
        lt(schema.emailVerifications.expiresAt, cutoff),
        eq(schema.emailVerifications.verifiedAt, null as unknown as Date),
      ),
    )
    .returning({ id: schema.emailVerifications.id });

  return result.length;
}

/**
 * Delete unverified user accounts older than 7 days.
 * Cascade deletes their verification tokens.
 */
export async function cleanupUnverifiedAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(schema.users)
    .where(and(eq(schema.users.isEmailVerified, false), lt(schema.users.createdAt, cutoff)))
    .returning({ id: schema.users.id });

  return result.length;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}
