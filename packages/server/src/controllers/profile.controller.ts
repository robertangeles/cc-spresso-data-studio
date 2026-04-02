import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as profileService from '../services/profile.service.js';
import * as sessionGate from '../services/session-gate.service.js';

// --- Profile ---

export async function getProfile(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const profile = await profileService.getProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const profile = await profileService.updateProfile(req.user.userId, req.body);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

// --- Rules ---

export async function listRules(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rules = await profileService.listRules(req.user.userId);
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
}

export async function createRule(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rule = await profileService.createRule(req.user.userId, req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

export async function updateRule(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rule = await profileService.updateRule(req.user.userId, req.params.id, req.body);
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

export async function deleteRule(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await profileService.deleteRule(req.user.userId, req.params.id);
    res.json({ success: true, data: null, message: 'Rule deleted' });
  } catch (err) {
    next(err);
  }
}

// --- Sessions ---

export async function getSessionStatus(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const status = await sessionGate.getSessionStatus(req.user.userId, req.user.role);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
}

// --- Password change ---

export async function changePassword(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { changePassword: doChange } = await import('../services/auth.service.js');
    await doChange(req.user.userId, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, data: null, message: 'Password changed' });
  } catch (err) {
    next(err);
  }
}

// --- Avatar upload ---

export async function uploadAvatar(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'Image data required' });
      return;
    }

    const { uploadImage } = await import('../services/cloudinary.service.js');
    const result = await uploadImage(image, {
      folder: 'avatars',
      publicId: `avatar_${req.user.userId}`,
      overwrite: true,
    });

    await profileService.updateProfile(req.user.userId, { avatarUrl: result.url });

    res.json({ success: true, data: { avatarUrl: result.url }, message: 'Avatar uploaded' });
  } catch (err) {
    next(err);
  }
}
