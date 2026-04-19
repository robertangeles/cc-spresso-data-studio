import { z } from 'zod';

/**
 * Zod schemas + TypeScript types for Model Studio.
 *
 * Shared between client forms and server validation. Keep all enum
 * values in lockstep with the Drizzle schema check constraints in
 * `packages/server/src/db/schema.ts` (data_model_* tables).
 *
 * Why a separate file: the Model Studio feature will own ~15 Zod
 * schemas by Step 11 (models, entities, attributes, relationships,
 * layer_links, canvas_states, semantic_mappings, chat turns, etc.).
 * Bundling them here avoids bloating the generic validation.ts.
 */

// ============================================================
// Enums — stringly-typed literals. Match schema.ts check lists.
// ============================================================

export const LAYER = z.enum(['conceptual', 'logical', 'physical']);
export type Layer = z.infer<typeof LAYER>;

export const NOTATION = z.enum(['ie', 'idef1x']);
export type Notation = z.infer<typeof NOTATION>;

export const ENTITY_TYPE = z.enum(['standard', 'associative', 'subtype', 'supertype']);
export type EntityType = z.infer<typeof ENTITY_TYPE>;

export const CARDINALITY = z.enum(['one', 'many', 'zero_or_one', 'zero_or_many', 'one_or_many']);
export type Cardinality = z.infer<typeof CARDINALITY>;

/** Direction the modeller is approaching the model from at creation:
 *  - greenfield      : top-down, conceptual → logical → physical.
 *  - existing_system : bottom-up, physical → logical → conceptual
 *                      (reverse-engineering an existing database). */
export const ORIGIN_DIRECTION = z.enum(['greenfield', 'existing_system']);
export type OriginDirection = z.infer<typeof ORIGIN_DIRECTION>;

// ============================================================
// Helpers
// ============================================================

const trimmedNonEmpty = (min: number, max: number, field: string) =>
  z
    .string()
    .trim()
    .min(min, `${field} must not be empty`)
    .max(max, `${field} must be ${max} characters or fewer`);

export const uuidParam = z.string().uuid('Invalid UUID');

// ============================================================
// Models (data_models table)
// ============================================================

/** Open-ended metadata bag. Future governance/classification plugins
 *  write into this. Validated shallowly at MVP — shape-tightening
 *  happens in later phases when specific metadata domains land. */
export const metadataSchema = z.record(z.unknown()).default({});

/** Tag list. Short lowercase slugs; capped to prevent abuse. */
export const tagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(30, 'Too many tags')
  .default([]);

export const modelCreateSchema = z.object({
  name: trimmedNonEmpty(1, 200, 'Name'),
  description: z
    .string()
    .max(10_000, 'Description must be 10,000 characters or fewer')
    .optional()
    .nullable(),
  // Models live inside a project; the organisation is derived from
  // projects.organisation_id server-side.
  projectId: uuidParam,
  activeLayer: LAYER.optional().default('conceptual'),
  notation: NOTATION.optional().default('ie'),
  /** Modelling-direction intent at creation. The dialog also passes
   *  activeLayer so the canvas opens on the matching layer; the two
   *  fields are decoupled because activeLayer changes as the user
   *  navigates layers, while originDirection is a fixed property of
   *  the model. */
  originDirection: ORIGIN_DIRECTION.optional().default('greenfield'),
  metadata: metadataSchema.optional(),
  tags: tagsSchema.optional(),
});
export type ModelCreate = z.infer<typeof modelCreateSchema>;

export const modelUpdateSchema = z
  .object({
    name: trimmedNonEmpty(1, 200, 'Name').optional(),
    description: z.string().max(10_000).nullable().optional(),
    activeLayer: LAYER.optional(),
    notation: NOTATION.optional(),
    originDirection: ORIGIN_DIRECTION.optional(),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
    archivedAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type ModelUpdate = z.infer<typeof modelUpdateSchema>;

export const modelIdParamsSchema = z.object({
  id: uuidParam,
});
export type ModelIdParams = z.infer<typeof modelIdParamsSchema>;

/** Listing filter: by project (default = all projects the user can see),
 *  optional archived flag, paging. Strict to reject typos like ?foo=bar. */
export const modelListQuerySchema = z
  .object({
    projectId: uuidParam.optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();
export type ModelListQuery = z.infer<typeof modelListQuerySchema>;

// ============================================================
// Canvas state (per user, per model, per layer)
// ============================================================

// Finite clamp — reject NaN / Infinity and anything outside ±1e6 so a
// malformed position can't make the canvas unusable.
const FINITE_COORD = z.number().finite().gte(-1_000_000).lte(1_000_000);

const nodePositionValue = z.object({
  x: FINITE_COORD,
  y: FINITE_COORD,
});

// Up to 5,000 node positions per canvas — well beyond any realistic
// MVP model size while still a cap to protect payload size.
export const nodePositionsSchema = z
  .record(z.string().uuid(), nodePositionValue)
  .refine((o) => Object.keys(o).length <= 5000, { message: 'Too many node positions' });

export const viewportSchema = z.object({
  x: FINITE_COORD,
  y: FINITE_COORD,
  zoom: z.number().finite().gte(0.1).lte(3),
});

export const canvasStateQuerySchema = z
  .object({
    layer: LAYER.optional().default('conceptual'),
  })
  .strict();
export type CanvasStateQuery = z.infer<typeof canvasStateQuerySchema>;

export const canvasStatePutSchema = z
  .object({
    layer: LAYER,
    nodePositions: nodePositionsSchema,
    viewport: viewportSchema,
  })
  .strict();
export type CanvasStatePut = z.infer<typeof canvasStatePutSchema>;

// ============================================================
// Entities (data_model_entities table) — Step 4
//
// Naming rules:
//   - Conceptual / logical layers: name is free-form (1–128 chars).
//   - Physical layer: name MUST be a SQL-safe identifier
//     (`/^[A-Za-z_][A-Za-z0-9_]*$/`). Enforced as a hard reject so a
//     malformed identifier can never reach DDL generation.
//
// `businessName` is the human-readable label and is free-form on every
// layer (so the canvas can render "Customer Order" while the physical
// table is `customer_order`).
// ============================================================

const PHYSICAL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const entityNameSchema = z
  .string()
  .trim()
  .min(1, 'Name must not be empty')
  .max(128, 'Name must be 128 characters or fewer');

const businessNameSchema = z
  .string()
  .trim()
  .min(1, 'Business name must not be empty')
  .max(255, 'Business name must be 255 characters or fewer');

export const entityCreateSchema = z
  .object({
    name: entityNameSchema,
    businessName: businessNameSchema.optional().nullable(),
    description: z
      .string()
      .max(10_000, 'Description must be 10,000 characters or fewer')
      .optional()
      .nullable(),
    layer: LAYER,
    entityType: ENTITY_TYPE.optional().default('standard'),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.layer === 'physical' && !PHYSICAL_IDENTIFIER.test(v.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message:
          'Physical-layer names must start with a letter or underscore and contain only letters, digits, and underscores.',
      });
    }
  });
export type EntityCreate = z.infer<typeof entityCreateSchema>;

export const entityUpdateSchema = z
  .object({
    name: entityNameSchema.optional(),
    businessName: businessNameSchema.nullable().optional(),
    description: z.string().max(10_000).nullable().optional(),
    layer: LAYER.optional(),
    entityType: ENTITY_TYPE.optional(),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type EntityUpdate = z.infer<typeof entityUpdateSchema>;

export const entityIdParamsSchema = z.object({
  id: uuidParam,
  entityId: uuidParam,
});
export type EntityIdParams = z.infer<typeof entityIdParamsSchema>;

export const entityListQuerySchema = z
  .object({
    layer: LAYER.optional(),
    limit: z.coerce.number().int().positive().max(500).optional().default(200),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();
export type EntityListQuery = z.infer<typeof entityListQuerySchema>;

/** Cascade flag for deletes that hit dependent rows.
 *  GET /entities/:eid returns a dependents preview; DELETE without
 *  ?confirm=cascade returns 409 + the dependents list when any exist. */
export const entityDeleteQuerySchema = z
  .object({
    confirm: z.enum(['cascade']).optional(),
  })
  .strict();
export type EntityDeleteQuery = z.infer<typeof entityDeleteQuerySchema>;

// ============================================================
// Attributes (data_model_attributes table) — Step 5
//
// Attributes belong to an entity and inherit the entity's layer. The
// schema validates only scalar shapes here — layer-dependent checks
// (e.g. snake_case on physical) run server-side after the entity is
// fetched for auth/ordinal calculation, so we don't duplicate the
// entity lookup on the client and we avoid requiring the client to
// echo the parent's layer in every request.
// ============================================================

const attributeNameSchema = z
  .string()
  .trim()
  .min(1, 'Name must not be empty')
  .max(128, 'Name must be 128 characters or fewer');

const attributeBusinessNameSchema = z
  .string()
  .trim()
  .min(1, 'Business name must not be empty')
  .max(255, 'Business name must be 255 characters or fewer');

const dataTypeSchema = z
  .string()
  .trim()
  .min(1, 'Data type must not be empty')
  .max(64, 'Data type must be 64 characters or fewer');

const defaultValueSchema = z.string().max(1000, 'Default value must be 1,000 characters or fewer');

export const attributeCreateSchema = z
  .object({
    name: attributeNameSchema,
    businessName: attributeBusinessNameSchema.optional().nullable(),
    description: z
      .string()
      .max(10_000, 'Description must be 10,000 characters or fewer')
      .optional()
      .nullable(),
    dataType: dataTypeSchema.optional().nullable(),
    length: z.number().int().positive().max(1_000_000).optional().nullable(),
    precision: z.number().int().positive().max(1000).optional().nullable(),
    scale: z.number().int().min(0).max(1000).optional().nullable(),
    isNullable: z.boolean().optional().default(true),
    isPrimaryKey: z.boolean().optional().default(false),
    isForeignKey: z.boolean().optional().default(false),
    isUnique: z.boolean().optional().default(false),
    defaultValue: defaultValueSchema.optional().nullable(),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict();
export type AttributeCreate = z.infer<typeof attributeCreateSchema>;

export const attributeUpdateSchema = z
  .object({
    name: attributeNameSchema.optional(),
    businessName: attributeBusinessNameSchema.nullable().optional(),
    description: z.string().max(10_000).nullable().optional(),
    dataType: dataTypeSchema.nullable().optional(),
    length: z.number().int().positive().max(1_000_000).nullable().optional(),
    precision: z.number().int().positive().max(1000).nullable().optional(),
    scale: z.number().int().min(0).max(1000).nullable().optional(),
    isNullable: z.boolean().optional(),
    isPrimaryKey: z.boolean().optional(),
    isForeignKey: z.boolean().optional(),
    isUnique: z.boolean().optional(),
    defaultValue: defaultValueSchema.nullable().optional(),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type AttributeUpdate = z.infer<typeof attributeUpdateSchema>;

/** Reorder body is a plain ordered list of attribute IDs; server
 *  dense-rewrites ordinal_position to 1..N in the supplied order. */
export const attributeReorderSchema = z
  .object({
    ids: z.array(uuidParam).min(1, 'At least one attribute id required').max(500),
  })
  .strict();
export type AttributeReorder = z.infer<typeof attributeReorderSchema>;

export const attributeIdParamsSchema = z.object({
  id: uuidParam,
  entityId: uuidParam,
  attributeId: uuidParam,
});
export type AttributeIdParams = z.infer<typeof attributeIdParamsSchema>;

export const attributeDeleteQuerySchema = z
  .object({
    confirm: z.enum(['cascade']).optional(),
  })
  .strict();
export type AttributeDeleteQuery = z.infer<typeof attributeDeleteQuerySchema>;

/** Synthetic data request (D9). Count is clamped; default 10 rows. */
export const syntheticDataRequestSchema = z
  .object({
    count: z.number().int().min(1).max(25).optional().default(10),
  })
  .strict();
export type SyntheticDataRequest = z.infer<typeof syntheticDataRequestSchema>;

// ============================================================
// Naming-lint (D6) — server is authoritative; client mirrors for
// inline amber underlines. Severity:
//   - violation: blocks DDL / invalid identifier (hard).
//   - warning : reserved-word style smell (soft).
// ============================================================

export const NAMING_LINT_SEVERITY = z.enum(['violation', 'warning']);
export type NamingLintSeverity = z.infer<typeof NAMING_LINT_SEVERITY>;

export const namingLintRuleSchema = z.object({
  rule: z.string(),
  severity: NAMING_LINT_SEVERITY,
  message: z.string(),
  /** Suggested replacement (e.g. snake_case rewrite). Optional. */
  suggestion: z.string().optional(),
});
export type NamingLintRule = z.infer<typeof namingLintRuleSchema>;
