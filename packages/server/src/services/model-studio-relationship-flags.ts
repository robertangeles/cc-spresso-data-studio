import {
  CARDINALITY,
  type Cardinality,
  LAYER,
  type Layer,
  type NamingLintRule,
  lintRelationshipName,
} from '@cc/shared';

/**
 * Step 6 — pure normaliser for relationship create / update payloads.
 *
 * Lives in the server (mirroring `model-studio-attribute-flags.ts`) so
 * the CRUD service can call a single function that:
 *
 *   1. Trims the name, collapses blank strings to `null`.
 *   2. Canonicalises enum-shaped values (cardinalities + layer) to
 *      lowercase. The DB stores varchars, not Postgres enums, so case
 *      drift would silently produce rows that fail to render in the
 *      IE / IDEF1X notation table.
 *   3. Runs `lintRelationshipName` on the normalised name + layer
 *      and returns the warnings alongside the normalised payload.
 *      The service surfaces warnings in the response so the UI can
 *      render inline underlines without a second round trip.
 *
 * Pure — no DB reads, no logger writes, no side effects. Called once
 * per create / patch path before any persistence. Contract tested at
 * `packages/server/src/services/__tests__/model-studio-relationship-flags.test.ts`.
 *
 * NOTE: cross-layer / cross-model / cycle / self-ref rules are NOT
 * enforced here — those require DB fetches. This function is the
 * `zod + case-fold` shim that precedes those stateful checks.
 */

export interface RelationshipNormalizerInput {
  name?: string | null;
  sourceCardinality?: string;
  targetCardinality?: string;
  layer?: string;
  isIdentifying?: boolean;
}

export interface NormalizedRelationship {
  name: string | null;
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
  layer?: Layer;
  isIdentifying?: boolean;
}

export interface RelationshipNormalizeResult {
  normalized: NormalizedRelationship;
  warnings: NamingLintRule[];
}

function normalizeName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function canonCardinality(value: string | undefined): Cardinality | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  // Throws a synchronous RangeError (caught by the caller + surfaced as 422).
  // Case drift beyond .toLowerCase() (e.g. 'ONE' passed as 'One ') is rejected
  // so the service never needs a second coercion pass.
  if (!CARDINALITY.options.includes(lower as Cardinality)) {
    throw new RangeError(`Invalid cardinality: ${value}`);
  }
  return lower as Cardinality;
}

function canonLayer(value: string | undefined): Layer | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (!LAYER.options.includes(lower as Layer)) {
    throw new RangeError(`Invalid layer: ${value}`);
  }
  return lower as Layer;
}

/**
 * Normalise a relationship create / patch payload and run naming lint.
 *
 * Returns `{ normalized, warnings }`. Callers should merge `normalized`
 * onto their insert / update payload and surface `warnings` in the
 * response envelope.
 *
 * Throws `RangeError` on bad enum casing — callers wrap as `ValidationError`.
 */
export function normalizeRelationship(
  input: RelationshipNormalizerInput,
): RelationshipNormalizeResult {
  const name = normalizeName(input.name);
  const sourceCardinality = canonCardinality(input.sourceCardinality);
  const targetCardinality = canonCardinality(input.targetCardinality);
  const layer = canonLayer(input.layer);

  const warnings: NamingLintRule[] = layer !== undefined ? lintRelationshipName(name, layer) : [];

  return {
    normalized: {
      name,
      sourceCardinality,
      targetCardinality,
      layer,
      isIdentifying: input.isIdentifying,
    },
    warnings,
  };
}
