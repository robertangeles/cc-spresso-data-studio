import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

interface FacebookTokenResponse {
  access_token: string;
  expires_in?: number;
  error?: { message: string; type?: string; code?: number };
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username: string };
}

interface FacebookPagesResponse {
  data?: FacebookPage[];
  error?: { message: string };
}

interface FacebookAccountResponse {
  id: string;
  name: string;
}

export class FacebookOAuthProvider implements OAuthProvider {
  platform = 'facebook';

  private async getCredentials(): Promise<{ appId: string; appSecret: string }> {
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
    const redirectUri = `${redirectBase}/api/oauth/facebook/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = 'pages_manage_posts,pages_read_engagement,pages_show_list,public_profile';
    return `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { appId, appSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/facebook/callback`;

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = (await tokenRes.json()) as FacebookTokenResponse;

    if (tokenData.error) {
      logger.error({ error: tokenData.error }, 'Facebook code exchange failed');
      throw new Error(tokenData.error.message || 'Failed to exchange code');
    }

    // Exchange for long-lived user token (60 days)
    const longLivedUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = (await longLivedRes.json()) as FacebookTokenResponse;

    if (longLivedData.error) {
      logger.error({ error: longLivedData.error }, 'Facebook long-lived token exchange failed');
      throw new Error(longLivedData.error.message || 'Failed to get long-lived token');
    }

    // Return the user access token — pages will be selected separately
    return {
      accessToken: longLivedData.access_token,
      expiresAt: new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000),
      accountType: 'user',
    };
  }

  /**
   * Get all Facebook Pages the user manages, with Page Access Tokens and linked IG accounts.
   */
  async getAvailablePages(userAccessToken: string): Promise<
    Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
      instagramAccountId?: string;
      instagramUsername?: string;
    }>
  > {
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userAccessToken}`,
    );
    const pagesData = (await pagesRes.json()) as FacebookPagesResponse;

    if (!pagesData.data || pagesData.data.length === 0) {
      return [];
    }

    return pagesData.data.map((page: FacebookPage) => ({
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      instagramAccountId: page.instagram_business_account?.id,
      instagramUsername: page.instagram_business_account?.username,
    }));
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    // Page Access Tokens derived from long-lived user tokens don't expire
    // but we can still try to refresh via the Graph API
    const { appId, appSecret } = await this.getCredentials();
    const refreshUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
    const res = await fetch(refreshUrl);
    const data = (await res.json()) as FacebookTokenResponse;

    if (data.error) {
      logger.error({ error: data.error }, 'Facebook token refresh failed');
      throw new Error(data.error.message || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${accessToken}`,
    );
    const data = (await res.json()) as FacebookAccountResponse;
    return { accountId: data.id, accountName: data.name };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    await fetch(`https://graph.facebook.com/v22.0/me/permissions?access_token=${accessToken}`, {
      method: 'DELETE',
    });
    logger.info('Facebook access revoked');
  }
}
