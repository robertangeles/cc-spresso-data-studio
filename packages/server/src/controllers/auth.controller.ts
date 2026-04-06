import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, AuthResponse } from '@cc/shared';
import * as authService from '../services/auth.service.js';
import * as turnstileService from '../services/turnstile.service.js';
import * as verificationService from '../services/verification.service.js';
import { seedDefaultSkillsForUser } from '../services/skills/seed-user-defaults.js';
import { getSetting } from '../services/admin.service.js';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export async function register(
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
  next: NextFunction,
) {
  try {
    const { email, password, name, turnstileToken, planId } = req.body;

    // Verify Turnstile CAPTCHA (gracefully degrades if not configured)
    await turnstileService.verify(turnstileToken, req.ip);

    const result = await authService.createUser(email, password, name, planId);

    // Send verification email (non-blocking — failure doesn't block registration)
    await verificationService.generateAndSend(result.user.id, email, name);

    // Seed default Anthropic skills (fire-and-forget — failure doesn't block registration)
    seedDefaultSkillsForUser(result.user.id).catch((err) =>
      console.error('Failed to seed default skills for user', result.user.id, err),
    );

    setRefreshCookie(res, result.refreshToken);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
  next: NextFunction,
) {
  try {
    const { email, password } = req.body;
    const result = await authService.verifyCredentials(email, password);

    // Check if user has a pending plan from signup flow
    const userRecord = await db.query.users.findFirst({
      where: eq(schema.users.id, result.user.id),
      columns: { pendingPlanId: true },
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        pendingPlanId: userRecord?.pendingPlanId || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'No refresh token', statusCode: 401 });
      return;
    }

    const result = await authService.refreshTokens(refreshToken);

    setRefreshCookie(res, result.refreshToken);

    res.json({
      success: true,
      data: { accessToken: result.accessToken },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await authService.revokeToken(refreshToken);
    }

    res.clearCookie('refreshToken');
    res.json({ success: true, data: null, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

export async function googleAuthUrl(_req: Request, res: Response, next: NextFunction) {
  try {
    const { getSetting } = await import('../services/admin.service.js');
    const setting = await getSetting('google-oauth');
    if (!setting) {
      res.status(400).json({ success: false, error: 'Google OAuth not configured' });
      return;
    }

    const config = JSON.parse(setting.value);
    const { config: appConfig } = await import('../config/index.js');
    const redirectUri = appConfig.isDev ? config.redirectUriDev : config.redirectUriProd;

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    res.json({
      success: true,
      data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` },
    });
  } catch (err) {
    next(err);
  }
}

export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: 'Authorization code required' });
      return;
    }

    const { getSetting } = await import('../services/admin.service.js');
    const setting = await getSetting('google-oauth');
    if (!setting) {
      res.status(400).json({ success: false, error: 'Google OAuth not configured' });
      return;
    }

    const config = JSON.parse(setting.value);
    const { config: appConfig } = await import('../config/index.js');
    const redirectUri = appConfig.isDev ? config.redirectUriDev : config.redirectUriProd;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error) {
      res
        .status(400)
        .json({ success: false, error: tokenData.error_description || tokenData.error });
      return;
    }

    // Get user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Find or create user
    const result = await authService.findOrCreateGoogleUser({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
    });

    // Seed default skills for new Google OAuth users (fire-and-forget)
    if (result.isNewUser) {
      seedDefaultSkillsForUser(result.user.id).catch((err) =>
        console.error('Failed to seed default skills for Google user', result.user.id, err),
      );
    }

    setRefreshCookie(res, result.refreshToken);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'Verification token is required' });
      return;
    }

    const userId = await verificationService.verifyToken(token);

    // Auto-login: generate tokens so the verify tab can proceed to checkout
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      res.json({ success: true, data: null, message: 'Email verified successfully' });
      return;
    }

    const tokens = await authService.generateTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      isEmailVerified: true,
    });

    setRefreshCookie(res, tokens.refreshToken);

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: true,
        },
        pendingPlanId: user.pendingPlanId || null,
      },
      message: 'Email verified successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as Request & { user: { userId: string } }).user.userId;
    await verificationService.resend(userId);

    res.json({ success: true, data: null, message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
}

export async function verificationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as Request & { user: { userId: string } }).user.userId;
    const status = await verificationService.getStatus(userId);

    // Include pendingPlanId so the frontend can redirect to checkout after verification
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { pendingPlanId: true },
    });

    res.json({ success: true, data: { ...status, pendingPlanId: user?.pendingPlanId || null } });
  } catch (err) {
    next(err);
  }
}

export async function captchaConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const setting = await getSetting('turnstile');
    if (!setting) {
      res.json({ success: true, data: { siteKey: null } });
      return;
    }

    const { siteKey } = JSON.parse(setting.value) as { siteKey?: string };
    res.json({ success: true, data: { siteKey: siteKey || null } });
  } catch (err) {
    next(err);
  }
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}
