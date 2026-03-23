import type { Request, Response, NextFunction } from 'express';
import * as flowService from '../services/flow.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { name, description } = req.body;
    const flow = await flowService.createFlow(req.user.userId, name, description);

    res.status(201).json({ success: true, data: flow });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const flows = await flowService.getFlows(req.user.userId);

    res.json({ success: true, data: flows });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const flow = await flowService.getFlowById(req.params.id, req.user.userId);

    res.json({ success: true, data: flow });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const flow = await flowService.updateFlow(req.params.id, req.user.userId, req.body);

    res.json({ success: true, data: flow });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await flowService.deleteFlow(req.params.id, req.user.userId);

    res.json({ success: true, data: null, message: 'Flow deleted' });
  } catch (err) {
    next(err);
  }
}
