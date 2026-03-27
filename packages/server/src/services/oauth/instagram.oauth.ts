import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export class InstagramOAuthProvider implements OAuthProvider {
  platform = 'instagram';

  private async getCredentials(): Promise<{ appId: string; appSecret: string }> {
    // Load from settings table
    const appIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'META_APP_ID'),
    });
    const appSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'META_APP_SECRET'),
    });
    if (!appIdSetting?.value || !appSecretSetting?.value) {
      throw new Error(
        'Meta App credentials not configured. Add META_APP_ID and META_APP_SECRET in Settings.',
      );
    }
    return { appId: appIdSetting.value, appSecret: appSecretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { appId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/instagram/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = 'instagram_basic,instagram_content_publish,pages_show_list';
    return `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { appId, appSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/instagram/callback`;

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = (await tokenRes.json()) as any;

    if (tokenData.error) {
      logger.error({ error: tokenData.error }, 'Instagram code exchange failed');
      throw new Error(tokenData.error.message || 'Failed to exchange code');
    }

    // Exchange for long-lived token (60 days)
    const longLivedUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = (await longLivedRes.json()) as any;

    if (longLivedData.error) {
      logger.error({ error: longLivedData.error }, 'Instagram long-lived token exchange failed');
      throw new Error(longLivedData.error.message || 'Failed to get long-lived token');
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // 60 days default

    // Get Instagram Business Account ID via Facebook Pages
    const { accountId, accountName } = await this.getAccountInfo(accessToken);

    return {
      accessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      accountId,
      accountName,
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const refreshUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=ig_refresh_token&access_token=${currentToken}`;
    const res = await fetch(refreshUrl);
    const data = (await res.json()) as any;

    if (data.error) {
      logger.error({ error: data.error }, 'Instagram token refresh failed');
      throw new Error(data.error.message || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    // Get Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?access_token=${accessToken}`,
    );
    const pagesData = (await pagesRes.json()) as any;

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error(
        'No Facebook Pages found. Instagram Business Account requires a linked Facebook Page.',
      );
    }

    // Get Instagram Business Account from first page
    const page = pagesData.data[0];
    const igRes = await fetch(
      `https://graph.facebook.com/v22.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}`,
    );
    const igData = (await igRes.json()) as any;

    if (!igData.instagram_business_account) {
      throw new Error(
        'No Instagram Business Account linked to this Facebook Page. Please connect an Instagram Professional account to your Facebook Page.',
      );
    }

    return {
      accountId: igData.instagram_business_account.id,
      accountName: igData.instagram_business_account.username || page.name,
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    // Revoke permissions
    await fetch(`https://graph.facebook.com/v22.0/me/permissions?access_token=${accessToken}`, {
      method: 'DELETE',
    });
    logger.info('Instagram access revoked');
  }
}
