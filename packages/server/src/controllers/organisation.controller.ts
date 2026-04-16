import type { Request, Response, NextFunction } from 'express';
import * as orgService from '../services/organisation.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { OrgRole } from '@cc/shared';

// ---------------------------------------------------------------------------
// Organisations
// ---------------------------------------------------------------------------

export async function listOrganisations(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const data = await orgService.listOrganisations(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createOrganisation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const org = await orgService.createOrganisation(req.user.userId, req.body);
    res.status(201).json({ success: true, data: org });
  } catch (err) {
    next(err);
  }
}

export async function getOrganisation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const org = await orgService.getOrganisation(req.params.orgId, req.user.userId);
    res.json({ success: true, data: org });
  } catch (err) {
    next(err);
  }
}

export async function updateOrganisation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const org = await orgService.updateOrganisation(req.params.orgId, req.user.userId, req.body);
    res.json({ success: true, data: org });
  } catch (err) {
    next(err);
  }
}

export async function deleteOrganisation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await orgService.deleteOrganisation(req.params.orgId, req.user.userId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function joinOrganisation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { joinKey } = req.body as { joinKey?: string };
    if (!joinKey) {
      res.status(400).json({ success: false, error: 'joinKey is required.' });
      return;
    }
    const result = await orgService.joinOrganisation(req.user.userId, joinKey);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await orgService.removeMember(req.params.orgId, req.user.userId, req.params.userId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { role } = req.body as { role?: OrgRole };
    if (!role) {
      res.status(400).json({ success: false, error: 'role is required.' });
      return;
    }
    const member = await orgService.updateMemberRole(
      req.params.orgId,
      req.user.userId,
      req.params.userId,
      role,
    );
    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function regenerateJoinKey(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const org = await orgService.regenerateJoinKey(req.params.orgId, req.user.userId);
    res.json({ success: true, data: org });
  } catch (err) {
    next(err);
  }
}
