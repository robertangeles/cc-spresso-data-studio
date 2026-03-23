import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as roleService from '../services/role.service.js';

export async function listRoles(
  _req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const roles = await roleService.listRoles();
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
}

export async function getRole(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const role = await roleService.getRoleById(req.params.id);
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function createRole(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const role = await roleService.createRole(req.body);
    res.status(201).json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function updateRole(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const role = await roleService.updateRole(req.params.id, req.body);
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await roleService.deleteRole(req.params.id);
    res.json({ success: true, data: null, message: 'Role deleted' });
  } catch (err) {
    next(err);
  }
}
