import { eq, and, lte } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logger } from '../../config/logger.js';
import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { InstagramOAuthProvider } from './instagram.oauth.js';
import { BlueskyOAuthProvider } from './bluesky.oauth.js';

// Registry of OAuth providers
const providers: Record<string, OAuthProvider> = {
  instagram: new InstagramOAuthProvider(),
  bluesky: new BlueskyOAuthProvider(),
};

export function getOAuthProvider(platform: string): OAuthProvider {
  const provider = providers[platform];
  if (!provider) throw new Error(`Unsupported OAuth platform: ${platform}`);
  return provider;
}

/**
 * Store or update tokens for a social account.
 * Upserts by (userId, platform, accountId) — supports multiple accounts per platform.
 */
export async function storeTokens(userId: string, platform: string, tokens: OAuthTokens) {
  const accountId = tokens.accountId ?? null;

  // Find existing account by the natural key: userId + platform + accountId
  const existing = accountId
    ? await db.query.socialAccounts.findFirst({
        where: and(
          eq(schema.socialAccounts.userId, userId),
          eq(schema.socialAccounts.platform, platform),
          eq(schema.socialAccounts.accountId, accountId),
        ),
      })
    : await db.query.socialAccounts.findFirst({
        where: and(
          eq(schema.socialAccounts.userId, userId),
          eq(schema.socialAccounts.platform, platform),
        ),
      });

  if (existing) {
    await db
      .update(schema.socialAccounts)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        accountId: tokens.accountId ?? existing.accountId,
        accountName: tokens.accountName ?? existing.accountName,
        accountType: tokens.accountType ?? existing.accountType,
        label: existing.label ?? tokens.accountName ?? existing.accountName,
        isConnected: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.socialAccounts.id, existing.id));
    logger.info({ userId, platform, accountId }, 'OAuth tokens updated');
    return existing.id;
  } else {
    const [row] = await db
      .insert(schema.socialAccounts)
      .values({
        userId,
        platform,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        accountId: tokens.accountId ?? null,
        accountName: tokens.accountName ?? null,
        accountType: tokens.accountType ?? 'personal',
        label: tokens.accountName ?? null,
        isConnected: true,
      })
      .returning();
    logger.info({ userId, platform, accountId }, 'OAuth tokens stored');
    return row.id;
  }
}

/**
 * Get all connected platforms for a user — returns full account details.
 */
export async function getConnectedPlatforms(userId: string): Promise<string[]> {
  const accounts = await db.query.socialAccounts.findMany({
    where: and(
      eq(schema.socialAccounts.userId, userId),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
  return accounts.map((a) => a.platform);
}

/**
 * Get all connected accounts for a user, grouped info.
 */
export async function getConnectedAccountsList(userId: string) {
  return db.query.socialAccounts.findMany({
    where: and(
      eq(schema.socialAccounts.userId, userId),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
}

/**
 * Get all connected accounts for a specific platform.
 */
export async function getConnectedAccounts(userId: string, platform: string) {
  return db.query.socialAccounts.findMany({
    where: and(
      eq(schema.socialAccounts.userId, userId),
      eq(schema.socialAccounts.platform, platform),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
}

/**
 * Get a specific connected account by ID.
 */
export async function getConnectedAccountById(socialAccountId: string) {
  return db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.id, socialAccountId),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
}

/**
 * Legacy: get first connected account for a platform (backward compat).
 */
export async function getConnectedAccount(userId: string, platform: string) {
  return db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.userId, userId),
      eq(schema.socialAccounts.platform, platform),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
}

/**
 * Update access/refresh tokens for a specific account by its PK.
 */
export async function updateAccountTokens(
  accountId: string,
  tokens: { accessToken: string; refreshToken: string },
) {
  await db
    .update(schema.socialAccounts)
    .set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      updatedAt: new Date(),
    })
    .where(eq(schema.socialAccounts.id, accountId));
  logger.info({ accountId }, 'Updated account tokens after refresh');
}

/**
 * Update the user-friendly label for an account.
 */
export async function updateAccountLabel(socialAccountId: string, userId: string, label: string) {
  await db
    .update(schema.socialAccounts)
    .set({ label, updatedAt: new Date() })
    .where(
      and(eq(schema.socialAccounts.id, socialAccountId), eq(schema.socialAccounts.userId, userId)),
    );
}

/**
 * Disconnect a specific account by its PK.
 */
export async function disconnectAccount(socialAccountId: string, userId: string) {
  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.id, socialAccountId),
      eq(schema.socialAccounts.userId, userId),
    ),
  });
  if (!account) return;

  // Try to revoke access on the platform side
  try {
    const provider = getOAuthProvider(account.platform);
    if (account.accessToken) {
      await provider.revokeAccess(account.accessToken);
    }
  } catch (err) {
    logger.warn(
      { err, platform: account.platform },
      'Failed to revoke OAuth access — removing locally anyway',
    );
  }

  await db
    .update(schema.socialAccounts)
    .set({ isConnected: false, accessToken: null, refreshToken: null, updatedAt: new Date() })
    .where(eq(schema.socialAccounts.id, account.id));

  logger.info(
    { userId, platform: account.platform, accountId: account.accountId },
    'OAuth account disconnected',
  );
}

export async function getExpiringTokens(daysUntilExpiry: number = 7) {
  const expiryThreshold = new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000);
  return db.query.socialAccounts.findMany({
    where: and(
      eq(schema.socialAccounts.isConnected, true),
      lte(schema.socialAccounts.tokenExpiresAt, expiryThreshold),
    ),
  });
}

export async function refreshExpiringTokens() {
  const expiring = await getExpiringTokens();
  let refreshed = 0;
  let failed = 0;

  for (const account of expiring) {
    try {
      const provider = getOAuthProvider(account.platform);
      if (!account.accessToken) continue;

      const newTokens = await provider.refreshToken(account.accessToken);
      await db
        .update(schema.socialAccounts)
        .set({
          accessToken: newTokens.accessToken,
          tokenExpiresAt: newTokens.expiresAt ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, account.id));
      refreshed++;
    } catch (err) {
      logger.error(
        { err, accountId: account.id, platform: account.platform },
        'Token refresh failed',
      );
      failed++;
    }
  }

  if (refreshed > 0 || failed > 0) {
    logger.info({ refreshed, failed }, 'OAuth token refresh complete');
  }
  return { refreshed, failed };
}
