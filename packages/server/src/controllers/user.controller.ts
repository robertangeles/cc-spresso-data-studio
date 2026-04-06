import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as userService from '../services/user.service.js';

export async function listUsers(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const users = await userService.listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

export async function getUser(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const user = await userService.getUser(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { name, role, roleId, isBlocked, freeSessionsLimit, freeSessionsUsed } = req.body;
    const user = await userService.updateUser(req.params.id, {
      name,
      role,
      roleId,
      isBlocked,
      freeSessionsLimit,
      freeSessionsUsed,
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function blockUser(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { blocked } = req.body;
    const user = await userService.blockUser(req.params.id, blocked);
    res.json({ success: true, data: user, message: blocked ? 'User blocked' : 'User unblocked' });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    // Prevent self-deletion
    if (req.params.id === req.user.userId) {
      res.status(400).json({ success: false, data: null, error: 'Cannot delete your own account' });
      return;
    }

    await userService.deleteUser(req.params.id);
    res.json({ success: true, data: null, message: 'User deleted' });
  } catch (err) {
    next(err);
  }
}

export async function setUserRoles(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { roleIds } = req.body;
    if (!Array.isArray(roleIds)) {
      res.status(400).json({ success: false, data: null, error: 'roleIds must be an array' });
      return;
    }
    const roles = await userService.setUserRoles(req.params.id, roleIds);
    res.json({ success: true, data: roles, message: 'Roles updated' });
  } catch (err) {
    next(err);
  }
}
