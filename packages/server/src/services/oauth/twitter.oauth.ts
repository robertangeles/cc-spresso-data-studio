import crypto from 'node:crypto';
import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export class TwitterOAuthProvider implements OAuthProvider {
  platform = 'twitter';

  private async getCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const clientIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'TWITTER_CLIENT_ID'),
    });
    const clientSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'TWITTER_CLIENT_SECRET'),
    });
    if (!clientIdSetting?.value || !clientSecretSetting?.value) {
      throw new Error(
        'Twitter/X credentials not configured. Add TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in Settings.',
      );
    }
    return { clientId: clientIdSetting.value, clientSecret: clientSecretSetting.value };
  }

  /**
   * Generate PKCE code verifier (43-128 chars, unreserved URI characters).
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge (S256 = SHA-256 hash of verifier, base64url-encoded).
   */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { clientId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/twitter/callback`;

    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Encode userId + codeVerifier in state param
    const state = Buffer.from(JSON.stringify({ userId, codeVerifier })).toString('base64url');

    const scopes = 'tweet.read tweet.write users.read media.write offline.access';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://x.com/i/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectBase: string,
    codeVerifier?: string,
  ): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/twitter/callback`;

    if (!codeVerifier) {
      throw new Error('PKCE code_verifier is required for Twitter OAuth 2.0');
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = (await tokenRes.json()) as any;

    if (!tokenRes.ok || tokenData.error) {
      logger.error(
        { error: tokenData.error, status: tokenRes.status },
        'Twitter code exchange failed',
      );
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code');
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // 2 hours default

    // Get user info
    const { accountId, accountName } = await this.getAccountInfo(accessToken);

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      accountId,
      accountName,
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentToken,
      }),
    });

    const data = (await res.json()) as any;

    if (!res.ok || data.error) {
      logger.error({ error: data.error, status: res.status }, 'Twitter token refresh failed');
      throw new Error(data.error_description || data.error || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token, // X rotates both tokens
      expiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = (await res.json()) as any;

    if (!res.ok || data.errors) {
      const errMsg = data.errors?.[0]?.message || data.detail || 'Failed to get Twitter profile';
      throw new Error(errMsg);
    }

    return {
      accountId: data.data.id,
      accountName: data.data.username,
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      const { clientId, clientSecret } = await this.getCredentials();
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      await fetch('https://api.x.com/2/oauth2/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
        }),
      });
      logger.info('Twitter/X access revoked');
    } catch (err) {
      logger.warn({ err }, 'Twitter revoke failed');
    }
  }
}
