import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as profileService from '../services/profile.service.js';

// --- Profile ---

export async function getProfile(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const profile = await profileService.getProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const profile = await profileService.updateProfile(req.user.userId, req.body);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

// --- Rules ---

export async function listRules(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rules = await profileService.listRules(req.user.userId);
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
}

export async function createRule(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rule = await profileService.createRule(req.user.userId, req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

export async function updateRule(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const rule = await profileService.updateRule(req.user.userId, req.params.id, req.body);
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

export async function deleteRule(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await profileService.deleteRule(req.user.userId, req.params.id);
    res.json({ success: true, data: null, message: 'Rule deleted' });
  } catch (err) {
    next(err);
  }
}

// --- Password change ---

export async function changePassword(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
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

export async function uploadAvatar(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    // Read base64 body
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'Image data required' });
      return;
    }

    // Get Cloudinary config
    const { getSetting } = await import('../services/admin.service.js');
    const setting = await getSetting('cloudinary');
    if (!setting) {
      res.status(400).json({ success: false, data: null, message: 'Cloudinary not configured' });
      return;
    }

    const cloudConfig = JSON.parse(setting.value);
    if (!cloudConfig.cloudName || !cloudConfig.apiKey || !cloudConfig.apiSecret) {
      res.status(400).json({ success: false, data: null, message: 'Cloudinary credentials incomplete' });
      return;
    }

    // Upload to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudConfig.cloudName}/image/upload`;
    const folder = `${cloudConfig.uploadFolder || 'draftpunk'}/avatars`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: image,
        upload_preset: undefined,
        folder,
        public_id: `avatar_${req.user.userId}`,
        overwrite: true,
        api_key: cloudConfig.apiKey,
        timestamp: Math.floor(Date.now() / 1000),
        signature: await generateCloudinarySignature(
          { folder, public_id: `avatar_${req.user.userId}`, overwrite: 'true', timestamp: String(Math.floor(Date.now() / 1000)) },
          cloudConfig.apiSecret,
        ),
      }),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      res.status(400).json({ success: false, data: null, message: `Upload failed: ${err}` });
      return;
    }

    const uploadData = await uploadRes.json() as { secure_url: string };
    const avatarUrl = uploadData.secure_url;

    // Save to profile
    await profileService.updateProfile(req.user.userId, { avatarUrl });

    res.json({ success: true, data: { avatarUrl }, message: 'Avatar uploaded' });
  } catch (err) {
    next(err);
  }
}

async function generateCloudinarySignature(params: Record<string, string>, apiSecret: string): Promise<string> {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const toSign = sorted.map(([k, v]) => `${k}=${v}`).join('&') + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(toSign);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
