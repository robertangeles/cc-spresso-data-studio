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
    // Optional because only the notation-flip path sends it; the
    // drag/pan/zoom path writes positions+viewport with no notation
    // change. Keeping the field optional preserves that contract while
    // letting `useNotation` PUT the flipped value through the same
    // endpoint instead of inventing a parallel route.
    notation: NOTATION.optional(),
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

/** Step 6 Direction A follow-up — optional one-line descriptive "purpose"
 *  label per alt-key group. Keyed by AK group name (`AK1`, `AK2`, …) and
 *  mapped to a short string (capped at 200 chars, enforced here and in
 *  the DB-level JSONB constraint). The badge rendered on the entity
 *  card stays `AK1` — this label is surfaced via tooltip on the badge
 *  and becomes the DDL constraint name when exported. Empty string
 *  values are rejected via `.min(1)` so "set to empty" is represented
 *  by removing the key from the map, not by an empty string. */
export const altKeyLabelsSchema = z.record(z.string().min(1).max(200));
export type AltKeyLabels = z.infer<typeof altKeyLabelsSchema>;

export const entityUpdateSchema = z
  .object({
    name: entityNameSchema.optional(),
    businessName: businessNameSchema.nullable().optional(),
    description: z.string().max(10_000).nullable().optional(),
    layer: LAYER.optional(),
    entityType: ENTITY_TYPE.optional(),
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
    altKeyLabels: altKeyLabelsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type EntityUpdate = z.infer<typeof entityUpdateSchema>;

/** Step 6 Direction A — canonical entity output shape the API returns.
 *  `displayId` is server-generated on create (`E001`, `E002`, …) and
 *  not user-settable. Exposed here so the client can render the ID
 *  chip top-right of the entity card. */
export const entitySchema = z.object({
  id: uuidParam,
  dataModelId: uuidParam,
  name: entityNameSchema,
  businessName: businessNameSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  layer: LAYER,
  entityType: ENTITY_TYPE,
  /** Server-assigned monotonic display ID, shape `^E\d+$` (e.g. `E001`).
   *  Optional because pre-backfill rows may still be null for a brief
   *  window between the `ALTER TABLE` and the backfill UPDATE — the
   *  runOnce migration wraps both in a single boot-time step so this
   *  is a transient concern, not a steady-state one. */
  displayId: z
    .string()
    .regex(/^E\d+$/, 'displayId must match /^E\\d+$/')
    .optional(),
  /** Step 6 Direction A follow-up — per-AK-group "purpose" labels.
   *  Defaults to `{}` so callers can always assume a map. See
   *  `altKeyLabelsSchema` for the value shape. */
  altKeyLabels: altKeyLabelsSchema.default({}),
  metadata: metadataSchema.default({}),
  tags: tagsSchema.default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Entity = z.infer<typeof entitySchema>;

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

/** Governance classification enum — DMBOK + compliance-framework
 *  categories. Stored as varchar on the attribute row so the list can
 *  evolve without a migration. Keep UI labels below in lockstep. */
export const ATTRIBUTE_CLASSIFICATION = z.enum([
  'PII',
  'PCI',
  'PHI',
  'Financial',
  'Confidential',
  'Restricted',
  'Internal',
  'Public',
]);
export type AttributeClassification = z.infer<typeof ATTRIBUTE_CLASSIFICATION>;

export const ATTRIBUTE_CLASSIFICATION_LABELS: Record<AttributeClassification, string> = {
  PII: 'PII — Personally Identifiable Information',
  PCI: 'PCI — Payment Card Information',
  PHI: 'PHI — Protected Health Information',
  Financial: 'Financial — SOX / financial reporting',
  Confidential: 'Confidential — business-confidential',
  Restricted: 'Restricted — highest-sensitivity internal',
  Internal: 'Internal — normal internal use',
  Public: 'Public — released externally',
};

const transformationLogicSchema = z
  .string()
  .max(20_000, 'Transformation logic must be 20,000 characters or fewer');

/** Step 6 Direction A — alt-key (business-key) grouping label. Shape
 *  `AKn` where `n` is one or more digits (`AK1`, `AK2`, `AK10`). Zod
 *  matches the server-side normaliser regex exactly so rejected input
 *  fails consistently no matter the entry point. Empty string is NOT
 *  accepted here — callers use `null` to clear the group. */
const altKeyGroupSchema = z
  .string()
  .regex(/^AK\d+$/, 'altKeyGroup must match /^AK\\d+$/ (e.g. AK1, AK2, AK10)')
  .nullable()
  .optional();

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
    classification: ATTRIBUTE_CLASSIFICATION.optional().nullable(),
    transformationLogic: transformationLogicSchema.optional().nullable(),
    /** Step 6 Direction A — business-key / alt-key group label. When set,
     *  the normaliser auto-coerces `isNullable=false` + `isUnique=true`
     *  on this attribute (composite UNIQUE is emitted at DDL-export
     *  time across all attrs in the entity sharing the same group). */
    altKeyGroup: altKeyGroupSchema,
    metadata: metadataSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict();
/** Input shape (pre-default) so callers can omit boolean flags that
 *  the schema supplies defaults for. The service always sees the
 *  parsed output with defaults applied. */
export type AttributeCreate = z.input<typeof attributeCreateSchema>;

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
    classification: ATTRIBUTE_CLASSIFICATION.nullable().optional(),
    transformationLogic: transformationLogicSchema.nullable().optional(),
    /** Step 6 Direction A — business-key / alt-key group label.
     *  `null` clears the group; an `AKn` value adds/moves the attribute
     *  into that group. See `attributeCreateSchema` for the invariant. */
    altKeyGroup: altKeyGroupSchema,
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

/** Model-wide attribute batch query. Lint is off by default because
 *  the canvas preload doesn't need it — lint rehydrates when the
 *  editor opens. Clients that want lint pass `?lint=true`. */
export const attributeBatchQuerySchema = z
  .object({
    lint: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();
export type AttributeBatchQuery = z.infer<typeof attributeBatchQuerySchema>;

// ============================================================
// Naming-lint (D6) — server is authoritative; client mirrors for
// inline amber underlines. Severity:
//   - violation: blocks DDL / invalid identifier (hard).
//   - warning : reserved-word style smell (soft).
// ============================================================

// `info` added Step 6 for advisory rules that are neither blockers nor
// reserved-word-style smells (e.g. relationship-name pattern hint).
// Additive-only — `violation` and `warning` retain their Step 4/5 shapes.
export const NAMING_LINT_SEVERITY = z.enum(['violation', 'warning', 'info']);
export type NamingLintSeverity = z.infer<typeof NAMING_LINT_SEVERITY>;

export const namingLintRuleSchema = z.object({
  rule: z.string(),
  severity: NAMING_LINT_SEVERITY,
  message: z.string(),
  /** Suggested replacement (e.g. snake_case rewrite). Optional. */
  suggestion: z.string().optional(),
});
export type NamingLintRule = z.infer<typeof namingLintRuleSchema>;

// ============================================================
// Relationships (data_model_relationships table) — Step 6
//
// Relationships connect two entities on the same model + layer. The
// Zod layer here validates shape only; the service enforces the
// cross-layer / cross-model / cycle invariants after authZ fetches.
//
// `metadata` is a JSONB bag capped at 4 KB (serialised) with the
// prototype-pollution-style keys rejected outright. This matches the
// Step 6 security hard rules in tasks/alignment-step6.md §7.
//
// `version` lives on the canonical row (6A — optimistic lock). Server
// assigns and increments it; PATCH requires the client-observed value
// or returns 409.
// ============================================================

/** Keys we refuse to store in JSONB because they can shadow Object
 *  prototype properties in downstream consumers. The list mirrors the
 *  defensive set used by hardened JSON parsers. */
const RELATIONSHIP_METADATA_BANNED_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const RELATIONSHIP_METADATA_MAX_BYTES = 4096;

/** Open-ended bag. Two-stage validation:
 *   1. Raw-input key guard (superRefine on `z.unknown()`): rejects the
 *      banned prototype-pollution keys BEFORE zod's `.record()` strips
 *      them. `z.record()` silently drops `__proto__` from parsed output,
 *      so a refine running over the parsed result never sees it.
 *   2. Record shape + 4 KB serialised-length refine on the passed-through
 *      value.
 *
 * `preprocess` + a typed throw is the idiomatic zod pattern here — we
 * can't use `pipe()` because the record stage would have already stripped
 * the offending key by the time the downstream refine runs. */
export const relationshipMetadataSchema = z
  .unknown()
  .superRefine((raw, ctx) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Metadata must be a plain object',
      });
      return;
    }
    // Inspect the raw own-property keys — `__proto__` survives JSON.parse
    // as an own property, which is exactly the attack surface we care about.
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      if (RELATIONSHIP_METADATA_BANNED_KEYS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Metadata contains a reserved key (${key})`,
        });
        return;
      }
    }
    // Serialised-size gate. Reject before we hand off to `.record()`
    // so the byte ceiling binds on raw input.
    if (JSON.stringify(raw).length > RELATIONSHIP_METADATA_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Metadata exceeds 4 KB',
      });
    }
  })
  .pipe(z.record(z.unknown()));

/** Free-form, optional rel name (e.g. "places", "belongs_to_customer").
 *  Trimmed; capped to match entity name length for symmetry. Nullable
 *  because an unnamed edge is legitimate (cardinality carries the
 *  semantics). */
const relationshipNameSchema = z
  .string()
  .trim()
  .max(128, 'Name must be 128 characters or fewer')
  .nullable()
  .optional();

/** Step 6 Direction A — inverse verb phrase (target → source). Pair
 *  with `name` so the edge renders both forward and reverse reading
 *  directions (e.g. `name="manages"`, `inverseName="is_managed_by"`).
 *  Same 128-char cap as `name` for symmetry; nullable because a rel
 *  with only a forward verb is legitimate. */
const relationshipInverseNameSchema = z
  .string()
  .trim()
  .max(128, 'Inverse name must be 128 characters or fewer')
  .nullable()
  .optional();

/** Canonical relationship row as the API returns it. */
export const relationshipSchema = z.object({
  id: uuidParam,
  dataModelId: uuidParam,
  sourceEntityId: uuidParam,
  targetEntityId: uuidParam,
  name: relationshipNameSchema,
  inverseName: relationshipInverseNameSchema,
  sourceCardinality: CARDINALITY,
  targetCardinality: CARDINALITY,
  isIdentifying: z.boolean(),
  layer: LAYER,
  metadata: relationshipMetadataSchema.default({}),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Relationship = z.infer<typeof relationshipSchema>;

/** Creation body — server owns id/dataModelId (from the URL)/version/
 *  timestamps. Callers only supply shape-level fields. Strict so typos
 *  surface as 422s instead of being silently dropped. */
export const createRelationshipSchema = z
  .object({
    sourceEntityId: uuidParam,
    targetEntityId: uuidParam,
    name: relationshipNameSchema,
    /** Step 6 Direction A — optional inverse verb phrase. */
    inverseName: relationshipInverseNameSchema,
    sourceCardinality: CARDINALITY,
    targetCardinality: CARDINALITY,
    isIdentifying: z.boolean(),
    layer: LAYER,
    metadata: relationshipMetadataSchema.optional(),
  })
  .strict();
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;

/** Partial patch. `version` is mandatory on every PATCH — it is the
 *  optimistic-lock token (6A). A patch without it must be rejected at
 *  the schema layer so stale clients can't accidentally race. */
export const updateRelationshipSchema = z
  .object({
    sourceEntityId: uuidParam.optional(),
    targetEntityId: uuidParam.optional(),
    name: relationshipNameSchema,
    /** Step 6 Direction A — optional inverse verb phrase. */
    inverseName: relationshipInverseNameSchema,
    sourceCardinality: CARDINALITY.optional(),
    targetCardinality: CARDINALITY.optional(),
    isIdentifying: z.boolean().optional(),
    layer: LAYER.optional(),
    metadata: relationshipMetadataSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict();
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;

/** Params for `/models/:id/relationships/:relId`. Both segments are
 *  UUIDs so we get a clean 422 on malformed ids before the service
 *  wastes a query on them. */
export const relationshipIdParamsSchema = z.object({
  id: uuidParam,
  relId: uuidParam,
});
export type RelationshipIdParams = z.infer<typeof relationshipIdParamsSchema>;

/** Params for `/models/:id/entities/:entityId/impact` (cascade-delete
 *  preview). Shares shape with the entity-id params but re-declared
 *  here to keep Step 6 additions locally grouped. */
export const entityImpactParamsSchema = z.object({
  id: uuidParam,
  entityId: uuidParam,
});
export type EntityImpactParams = z.infer<typeof entityImpactParamsSchema>;
