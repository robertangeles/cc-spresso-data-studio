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
