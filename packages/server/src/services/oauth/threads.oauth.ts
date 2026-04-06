import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

interface ThreadsTokenResponse {
  access_token: string;
  expires_in?: number;
  error?: string;
  error_message?: string;
}

interface ThreadsUserResponse {
  id: string;
  username: string;
  error?: { message: string };
}

export class ThreadsOAuthProvider implements OAuthProvider {
  platform = 'threads';

  private async getCredentials(): Promise<{ appId: string; appSecret: string }> {
    // Try Threads-specific credentials first, fall back to shared Meta credentials
    let appIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'THREADS_APP_ID'),
    });
    if (!appIdSetting?.value) {
      appIdSetting = await db.query.settings.findFirst({
        where: eq(schema.settings.key, 'META_APP_ID'),
      });
    }
    let appSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'THREADS_APP_SECRET'),
    });
    if (!appSecretSetting?.value) {
      appSecretSetting = await db.query.settings.findFirst({
        where: eq(schema.settings.key, 'META_APP_SECRET'),
      });
    }
    if (!appIdSetting?.value || !appSecretSetting?.value) {
      throw new Error(
        'Threads App credentials not configured. Add THREADS_APP_ID and THREADS_APP_SECRET in Settings → Social Media → Threads.',
      );
    }
    logger.info(
      { appId: appIdSetting.value.substring(0, 6) + '...' },
      'Threads credentials loaded',
    );
    return { appId: appIdSetting.value, appSecret: appSecretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { appId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/threads/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = 'threads_basic,threads_content_publish,threads_manage_insights';
    const authUrl = `https://threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;
    logger.info({ authUrl, appIdPrefix: appId.substring(0, 6) }, 'Threads OAuth URL generated');
    return authUrl;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { appId, appSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/threads/callback`;

    // Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as ThreadsTokenResponse;

    if (tokenData.error) {
      logger.error({ error: tokenData.error }, 'Threads code exchange failed');
      throw new Error(tokenData.error_message || 'Failed to exchange code');
    }

    // Exchange for long-lived token (60 days)
    const longLivedRes = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`,
    );
    const longLivedData = (await longLivedRes.json()) as ThreadsTokenResponse;

    if (longLivedData.error) {
      logger.error({ error: longLivedData.error }, 'Threads long-lived token exchange failed');
      throw new Error(longLivedData.error_message || 'Failed to get long-lived token');
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000;

    // Get Threads user profile
    const { accountId, accountName } = await this.getAccountInfo(accessToken);

    return {
      accessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      accountId,
      accountName,
      accountType: 'personal',
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const refreshUrl = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`;
    const res = await fetch(refreshUrl);
    const data = (await res.json()) as ThreadsTokenResponse;

    if (data.error) {
      logger.error({ error: data.error }, 'Threads token refresh failed');
      throw new Error(data.error_message || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`,
    );
    const data = (await res.json()) as ThreadsUserResponse;

    if (data.error) {
      throw new Error(data.error.message || 'Failed to get Threads profile');
    }

    return {
      accountId: data.id,
      accountName: data.username || 'Threads User',
    };
  }

  async revokeAccess(_accessToken: string): Promise<void> {
    // Threads doesn't have a revoke endpoint — just disconnect locally
    logger.info('Threads access revoked locally');
  }
}
