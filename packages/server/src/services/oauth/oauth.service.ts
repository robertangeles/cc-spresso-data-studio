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

export async function storeTokens(userId: string, platform: string, tokens: OAuthTokens) {
  // Check if account already exists
  const existing = await db.query.socialAccounts.findFirst({
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
        isConnected: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.socialAccounts.id, existing.id));
    logger.info({ userId, platform }, 'OAuth tokens updated');
  } else {
    await db.insert(schema.socialAccounts).values({
      userId,
      platform,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      accountId: tokens.accountId ?? null,
      accountName: tokens.accountName ?? null,
      isConnected: true,
    });
    logger.info({ userId, platform }, 'OAuth tokens stored');
  }
}

export async function getConnectedAccount(userId: string, platform: string) {
  return db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.userId, userId),
      eq(schema.socialAccounts.platform, platform),
      eq(schema.socialAccounts.isConnected, true),
    ),
  });
}

export async function disconnectAccount(userId: string, platform: string) {
  const account = await getConnectedAccount(userId, platform);
  if (!account) return;

  // Try to revoke access on the platform side
  try {
    const provider = getOAuthProvider(platform);
    if (account.accessToken) {
      await provider.revokeAccess(account.accessToken);
    }
  } catch (err) {
    logger.warn({ err, platform }, 'Failed to revoke OAuth access — removing locally anyway');
  }

  await db
    .update(schema.socialAccounts)
    .set({ isConnected: false, accessToken: null, refreshToken: null, updatedAt: new Date() })
    .where(eq(schema.socialAccounts.id, account.id));

  logger.info({ userId, platform }, 'OAuth account disconnected');
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
