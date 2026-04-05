import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import type { TokenPayload, User } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { isDisposableEmail } from '../utils/disposable-emails.js';

export async function createUser(email: string, password: string, name: string, planId?: string) {
  // Block disposable email domains
  if (isDisposableEmail(email)) {
    throw new ValidationError({
      email: ['Please use a permanent email address. Disposable email providers are not allowed.'],
    });
  }

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(password);

  // Look up the default 'Subscriber' role for new users
  const defaultRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, 'Subscriber'),
  });

  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      name,
      role: 'Subscriber',
      roleId: defaultRole?.id ?? null,
      isEmailVerified: false,
      pendingPlanId: planId || null,
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      subscriptionTier: schema.users.subscriptionTier,
      isEmailVerified: schema.users.isEmailVerified,
    });

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier ?? 'free',
    isEmailVerified: user.isEmailVerified,
  });

  return { user: { ...user, role: user.role as User['role'] }, ...tokens };
}

/**
 * Find or create a user from Google OAuth profile.
 * If user exists by googleId or email, link and return.
 * Otherwise create a new user (no password required).
 */
export async function findOrCreateGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
}) {
  // Check by googleId first
  let user = await db.query.users.findFirst({
    where: eq(schema.users.googleId, profile.googleId),
  });

  if (!user) {
    // Check by email — link existing account to Google
    user = await db.query.users.findFirst({
      where: eq(schema.users.email, profile.email),
    });

    if (user) {
      // Link Google ID to existing account
      [user] = await db
        .update(schema.users)
        .set({ googleId: profile.googleId, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id))
        .returning();
    }
  }

  if (!user) {
    // New user via Google — no password needed, email already verified by Google
    const defaultRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, 'Subscriber'),
    });

    [user] = await db
      .insert(schema.users)
      .values({
        email: profile.email,
        name: profile.name,
        googleId: profile.googleId,
        role: 'Subscriber',
        roleId: defaultRole?.id ?? null,
        isEmailVerified: true,
      })
      .returning();
  } else if (!user.isEmailVerified) {
    // Existing user linking Google — mark as verified (Google confirmed their email)
    [user] = await db
      .update(schema.users)
      .set({ isEmailVerified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id))
      .returning();
  }

  if (user.isBlocked) {
    throw new UnauthorizedError('Your account has been suspended. Contact support for assistance.');
  }

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier ?? 'free',
    isEmailVerified: user.isEmailVerified,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as User['role'],
      subscriptionTier: user.subscriptionTier,
      isEmailVerified: user.isEmailVerified,
    },
    ...tokens,
  };
}

export async function verifyCredentials(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.isBlocked) {
    throw new UnauthorizedError('Your account has been suspended. Contact support for assistance.');
  }

  if (!user.passwordHash) {
    throw new UnauthorizedError('This account uses Google sign-in. Please use the Google button.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier ?? 'free',
    isEmailVerified: user.isEmailVerified,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as User['role'],
      subscriptionTier: user.subscriptionTier,
      isEmailVerified: user.isEmailVerified,
    },
    ...tokens,
  };
}

export async function generateTokens(payload: TokenPayload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store hashed refresh token in DB
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db
    .insert(schema.refreshTokens)
    .values({
      userId: payload.userId,
      tokenHash,
      expiresAt,
    })
    .onConflictDoNothing();

  return { accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(schema.refreshTokens.tokenHash, tokenHash),
  });

  if (!storedToken || storedToken.revokedAt) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  // Revoke old token
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.refreshTokens.id, storedToken.id));

  // Fetch current user state (may have changed since JWT was issued)
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.userId),
    columns: { isEmailVerified: true, role: true, subscriptionTier: true },
  });

  // Issue new tokens with fresh state
  return generateTokens({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: user?.role ?? payload.role,
    subscriptionTier: user?.subscriptionTier ?? 'free',
    isEmailVerified: user?.isEmailVerified ?? false,
  });
}

export async function revokeToken(refreshToken: string) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.refreshTokens.tokenHash, tokenHash));
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) throw new Error('User not found');

  if (!user.passwordHash) {
    throw new Error('This account uses Google sign-in. Password change is not available.');
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new Error('Current password is incorrect');

  const newHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}
