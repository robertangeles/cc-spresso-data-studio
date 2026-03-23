import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, AuthResponse } from '@cc/shared';
import * as authService from '../services/auth.service.js';

export async function register(req: Request, res: Response<ApiResponse<AuthResponse>>, next: NextFunction) {
  try {
    const { email, password, name } = req.body;
    const result = await authService.createUser(email, password, name);

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

export async function login(req: Request, res: Response<ApiResponse<AuthResponse>>, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.verifyCredentials(email, password);

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

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}
