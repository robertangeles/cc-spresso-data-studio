import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  modelCreateSchema,
  modelUpdateSchema,
  modelIdParamsSchema,
  modelListQuerySchema,
  canvasStatePutSchema,
  canvasStateQuerySchema,
  entityCreateSchema,
  entityUpdateSchema,
  entityIdParamsSchema,
  entityListQuerySchema,
  entityDeleteQuerySchema,
  entityImpactParamsSchema,
  attributeCreateSchema,
  attributeUpdateSchema,
  attributeIdParamsSchema,
  attributeReorderSchema,
  attributeDeleteQuerySchema,
  attributeBatchQuerySchema,
  syntheticDataRequestSchema,
  createRelationshipSchema,
  updateRelationshipSchema,
  relationshipIdParamsSchema,
} from '@cc/shared';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validate, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { NotFoundError } from '../utils/errors.js';
import * as modelStudioController from '../controllers/model-studio.controller.js';
import * as modelStudioService from '../services/model-studio.service.js';
import * as modelController from '../controllers/model-studio-model.controller.js';
import * as canvasController from '../controllers/model-studio-canvas.controller.js';
import * as entityController from '../controllers/model-studio-entity.controller.js';
import * as attributeController from '../controllers/model-studio-attribute.controller.js';
import * as relationshipController from '../controllers/model-studio-relationship.controller.js';

/**
 * Model Studio — Step 1 routes.
 *
 * Surface:
 *   GET  /api/model-studio/flag   (authenticated)     → read the feature flag
 *   PUT  /api/model-studio/flag   (authenticated+admin) → update the flag
 *
 * When the flag is OFF the client renders the "Coming soon" stub;
 * when ON the client renders the empty-state list page (placeholder
 * until Step 2 wires full model CRUD).
 *
 * Feature gate (F1 fix):
 *   Everything under /api/model-studio/* returns 404 when the flag is
 *   OFF — except the /flag endpoint itself, which must always be
 *   reachable so the client can read and the admin can toggle it.
 *   The gate runs BEFORE auth so unauthenticated probes cannot
 *   distinguish "feature OFF" from "no such namespace" (no info-leak
 *   via 401 vs 404).
 *
 * Performance note: the gate reads the flag from the DB per-request
 * right now. For Step 2+ (real CRUD volume) add a short-lived
 * in-memory cache (~10 s TTL) or subscribe to change_log events.
 */

const FLAG_EXEMPT_PATHS = new Set(['/flag']);

async function featureFlagGate(req: Request, _res: Response, next: NextFunction) {
  try {
    if (FLAG_EXEMPT_PATHS.has(req.path)) return next();
    const enabled = await modelStudioService.getFlagEnabled();
    if (!enabled) return next(new NotFoundError('Resource'));
    next();
  } catch (err) {
    next(err);
  }
}

const router = Router();

router.use(featureFlagGate);
router.use(authenticate);

router.get('/flag', modelStudioController.getFlag);

const setFlagSchema = z.object({
  enabled: z.boolean(),
});

router.put(
  '/flag',
  requireRole('Administrator'),
  validate(setFlagSchema),
  modelStudioController.setFlag,
);

// ============================================================
// Models — Step 2
// All routes below 404 when the flag is OFF (via featureFlagGate above).
// Authorisation is handled inside the service via canAccessModel.
// ============================================================

router.get('/models', validateQuery(modelListQuerySchema), modelController.list);
router.post('/models', validate(modelCreateSchema), modelController.create);
router.get('/models/:id', validateParams(modelIdParamsSchema), modelController.getOne);
router.patch(
  '/models/:id',
  validateParams(modelIdParamsSchema),
  validate(modelUpdateSchema),
  modelController.update,
);
router.delete('/models/:id', validateParams(modelIdParamsSchema), modelController.remove);

// ============================================================
// Canvas state — Step 3
// ============================================================

router.get(
  '/models/:id/canvas-state',
  validateParams(modelIdParamsSchema),
  validateQuery(canvasStateQuerySchema),
  canvasController.getState,
);
router.put(
  '/models/:id/canvas-state',
  validateParams(modelIdParamsSchema),
  validate(canvasStatePutSchema),
  canvasController.putState,
);

// ============================================================
// Entities — Step 4
// All routes here also pass through featureFlagGate + authenticate.
// Authorisation is enforced inside the service via assertCanAccessModel.
// ============================================================

router.get(
  '/models/:id/entities',
  validateParams(modelIdParamsSchema),
  validateQuery(entityListQuerySchema),
  entityController.list,
);
router.post(
  '/models/:id/entities',
  validateParams(modelIdParamsSchema),
  validate(entityCreateSchema),
  entityController.create,
);
router.get(
  '/models/:id/entities/:entityId',
  validateParams(entityIdParamsSchema),
  entityController.getOne,
);
router.patch(
  '/models/:id/entities/:entityId',
  validateParams(entityIdParamsSchema),
  validate(entityUpdateSchema),
  entityController.update,
);
router.delete(
  '/models/:id/entities/:entityId',
  validateParams(entityIdParamsSchema),
  validateQuery(entityDeleteQuerySchema),
  entityController.remove,
);
router.post(
  '/models/:id/entities/:entityId/auto-describe',
  validateParams(entityIdParamsSchema),
  entityController.autoDescribe,
);

// ============================================================
// Attributes — Step 5
// Nested under an entity. Ordering is via a dedicated /reorder
// endpoint rather than per-row PATCH to keep the semantics atomic
// and the change_log clean.
// ============================================================

router.get(
  '/models/:id/entities/:entityId/attributes',
  validateParams(entityIdParamsSchema),
  attributeController.list,
);
router.post(
  '/models/:id/entities/:entityId/attributes',
  validateParams(entityIdParamsSchema),
  validate(attributeCreateSchema),
  attributeController.create,
);
router.post(
  '/models/:id/entities/:entityId/attributes/reorder',
  validateParams(entityIdParamsSchema),
  validate(attributeReorderSchema),
  attributeController.reorder,
);
router.post(
  '/models/:id/entities/:entityId/synthetic-data',
  validateParams(entityIdParamsSchema),
  validate(syntheticDataRequestSchema),
  attributeController.syntheticData,
);
router.get(
  '/models/:id/entities/:entityId/attributes/:attributeId',
  validateParams(attributeIdParamsSchema),
  attributeController.getOne,
);
router.patch(
  '/models/:id/entities/:entityId/attributes/:attributeId',
  validateParams(attributeIdParamsSchema),
  validate(attributeUpdateSchema),
  attributeController.update,
);
router.delete(
  '/models/:id/entities/:entityId/attributes/:attributeId',
  validateParams(attributeIdParamsSchema),
  validateQuery(attributeDeleteQuerySchema),
  attributeController.remove,
);

// Model-wide attribute batch + per-attribute history (Step 5 follow-ups).
// Batch powers the canvas preload; history feeds the Erwin-style editor.
router.get(
  '/models/:id/attributes',
  validateParams(modelIdParamsSchema),
  validateQuery(attributeBatchQuerySchema),
  attributeController.listByModel,
);
router.get(
  '/models/:id/entities/:entityId/attributes/:attributeId/history',
  validateParams(attributeIdParamsSchema),
  attributeController.history,
);

// ============================================================
// Relationships — Step 6
//
// Gated by the `MODEL_STUDIO_RELATIONSHIPS_ENABLED` env flag. When OFF,
// every rel route 404s — per alignment-step6.md §4 we must NOT leak
// "feature exists but disabled" vs "no such route" to unauthenticated
// probes. The gate runs inside each route handler block so the rest of
// Model Studio keeps working while Step 6 is toggled.
//
// Authorisation:
//   - read-level (`list`, `getOne`, `entityImpact`) — reader+ role via
//     `assertCanAccessModel` (any org member counts as reader).
//   - write-level (`create`, `update`, `remove`, `infer`) — editor+ role
//     via the same assertion (current codebase does not differentiate
//     reader vs editor, per `model-studio-authz.service.ts` doc comment).
//     Step-7 will tighten to roleId once roles are wired.
//   - admin-level diagnostics — `requireRole('Administrator')`.
// ============================================================

function relationshipsEnabledGate(_req: Request, _res: Response, next: NextFunction) {
  // Feature flag pattern: env-driven boolean. Lives in env so toggling
  // doesn't require a DB write — parallels `MODEL_STUDIO_DEFAULT_MODEL`.
  if (process.env.MODEL_STUDIO_RELATIONSHIPS_ENABLED !== 'true') {
    return next(new NotFoundError('Resource'));
  }
  next();
}

/**
 * Rate limiter for `POST /:modelId/relationships/infer`.
 * 10 requests per minute per user per alignment-step6.md §7 security rule.
 * Falls back to IP if the authenticated user id is somehow missing.
 */
const inferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? 'anon',
  message: {
    success: false,
    error: 'Too many inference requests. Please slow down.',
    statusCode: 429,
  },
});

router.get(
  '/models/:id/relationships',
  relationshipsEnabledGate,
  validateParams(modelIdParamsSchema),
  relationshipController.list,
);
router.post(
  '/models/:id/relationships',
  relationshipsEnabledGate,
  validateParams(modelIdParamsSchema),
  validate(createRelationshipSchema),
  relationshipController.create,
);
router.post(
  '/models/:id/relationships/infer',
  relationshipsEnabledGate,
  inferLimiter,
  validateParams(modelIdParamsSchema),
  relationshipController.infer,
);
router.get(
  '/models/:id/relationships/:relId',
  relationshipsEnabledGate,
  validateParams(relationshipIdParamsSchema),
  relationshipController.getOne,
);
router.patch(
  '/models/:id/relationships/:relId',
  relationshipsEnabledGate,
  validateParams(relationshipIdParamsSchema),
  validate(updateRelationshipSchema),
  relationshipController.update,
);
router.delete(
  '/models/:id/relationships/:relId',
  relationshipsEnabledGate,
  validateParams(relationshipIdParamsSchema),
  relationshipController.remove,
);

// Cascade-delete preview for an entity — lists the rels that would be
// removed if the entity were deleted.
router.get(
  '/models/:id/entities/:entityId/impact',
  relationshipsEnabledGate,
  validateParams(entityImpactParamsSchema),
  relationshipController.entityImpact,
);

// Admin-only diagnostics. `requireRole('Administrator')` gates BEFORE
// validation so unauthorised callers cannot enumerate routes.
router.get(
  '/admin/model-studio/models/:id/relationships/diagnostics',
  relationshipsEnabledGate,
  requireRole('Administrator'),
  validateParams(modelIdParamsSchema),
  relationshipController.diagnostics,
);
router.get(
  '/admin/model-studio/models/:id/relationships/explain',
  relationshipsEnabledGate,
  requireRole('Administrator'),
  validateParams(modelIdParamsSchema),
  relationshipController.explainMermaid,
);

export { router as modelStudioRoutes };
