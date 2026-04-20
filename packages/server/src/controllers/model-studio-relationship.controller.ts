import type { Request, Response, NextFunction } from 'express';
import type { CreateRelationshipInput, UpdateRelationshipInput } from '@cc/shared';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import * as relationshipService from '../services/model-studio-relationship.service.js';
import * as inferService from '../services/model-studio-relationship-infer.service.js';
import * as diagnosticsService from '../services/model-studio-relationship-diagnostics.service.js';

/**
 * Thin pass-through controllers for Step 6 relationship endpoints.
 *
 * Validation runs in middleware (the shared zod schemas), authz lives
 * in the services (`assertCanAccessModel`), and error-to-HTTP mapping
 * is handled by the shared `errorHandler` (each thrown class already
 * carries its own status code).
 *
 * `VersionConflictError` is the one case where the controller needs to
 * add body context beyond the default envelope — the error class
 * exposes `serverVersion`, and the controller relays it via a custom
 * `.details` field so the client can render "reload to version N".
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

/** Org-admin gate — the Administrator role is the single admin bucket
 *  in this codebase (see role.types.ts + auth.middleware.requireRole).
 *  Keeping the helper here so the diagnostics routes gate on the user's
 *  resolved `role` without threading it through service signatures. */
function requireAdmin(req: Request): string {
  const userId = requireUserId(req);
  if (req.user?.role !== 'Administrator') {
    throw new ForbiddenError('Admin role required for diagnostics.');
  }
  return userId;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await relationshipService.listRelationships(userId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const row = await relationshipService.getRelationship(userId, req.params.id, req.params.relId);
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const created = await relationshipService.createRelationship(
      userId,
      req.params.id,
      req.body as CreateRelationshipInput,
    );
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const updated = await relationshipService.updateRelationship(
      userId,
      req.params.id,
      req.params.relId,
      req.body as UpdateRelationshipInput,
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    // VersionConflictError carries extra context (serverVersion) the
    // default handler can't surface. Route it manually so the client
    // sees `{ error, details: { serverVersion } }` in the 409 body.
    if (err instanceof relationshipService.VersionConflictError) {
      res.status(409).json({
        success: false,
        error: err.message,
        statusCode: 409,
        details: { serverVersion: [String(err.serverVersion)], code: [err.code] },
      });
      return;
    }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await relationshipService.deleteRelationship(
      userId,
      req.params.id,
      req.params.relId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function infer(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await inferService.inferRelationshipsFromFkGraph({
      userId,
      modelId: req.params.id,
    });
    // 202 when we queued an async job, 200 when we ran sync.
    if (result.async) {
      res.status(202).json({ success: true, data: result });
    } else {
      res.status(200).json({ success: true, data: result });
    }
  } catch (err) {
    next(err);
  }
}

export async function entityImpact(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const impact = await relationshipService.getEntityImpact(
      userId,
      req.params.id,
      req.params.entityId,
    );
    res.json({ success: true, data: impact });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// Admin diagnostics — org-admin only
// ============================================================

export async function diagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    requireAdmin(req);
    const orphans = await diagnosticsService.findOrphanPropagatedAttrs(req.params.id);
    const summary = await diagnosticsService.summariseDiagnostics(req.params.id);
    res.json({ success: true, data: { ...summary, orphans } });
  } catch (err) {
    next(err);
  }
}

export async function explainMermaid(req: Request, res: Response, next: NextFunction) {
  try {
    requireAdmin(req);
    const result = await diagnosticsService.exportMermaidER(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
