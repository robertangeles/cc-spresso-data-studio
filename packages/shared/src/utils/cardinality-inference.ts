import type { Cardinality } from './model-studio.schemas.js';

/**
 * Step 6 — cardinality inference from attribute flags.
 *
 * Pure function used by both the client (inline preview before POST)
 * and the server-side FK-graph walker (`inferRelationshipsFromFkGraph`).
 * No side effects, no DB reads — the caller supplies the four booleans
 * it has already resolved.
 *
 * Reasoning:
 *   - The target side of an FK ALWAYS points at a PK column, which is
 *     by definition `NOT NULL + UNIQUE`. That makes the target side
 *     `one` unconditionally.
 *   - The source side varies with the source attribute's UNIQUE /
 *     NULLABLE flags:
 *
 *     | UQ    | NN    | Source cardinality        | Confidence |
 *     | ----- | ----- | ------------------------- | ---------- |
 *     | true  | true  | one            (1:1)      | high       |
 *     | true  | false | zero_or_one    (0..1:1)   | high       |
 *     | false | true  | one_or_many    (1..*:1)   | medium     |
 *     | false | false | zero_or_many   (0..*:1)   | medium     |
 *
 *     Confidence drops to `medium` on non-unique sources because the
 *     flag alone can't distinguish "genuinely many" from "missing a
 *     UNIQUE constraint the DBA forgot to declare".
 *
 * Returns `null` when inference is impossible (no FK, or target side
 * isn't a PK column). Callers MUST treat null as "skip, don't guess".
 */
export interface CardinalityInferenceInput {
  /** Source attribute carries a FOREIGN KEY flag. */
  isFk: boolean;
  /** Source attribute is UNIQUE. */
  isUq: boolean;
  /** Source attribute is NOT NULL. */
  isNn: boolean;
  /** Target attribute is a PRIMARY KEY on the target entity. */
  targetIsPk: boolean;
}

export interface CardinalityInferenceResult {
  source: Cardinality;
  target: Cardinality;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Infer source/target cardinalities from attribute flags.
 * Returns null when the inputs don't describe a valid FK→PK pair.
 */
export function inferCardinalityFromFlags(
  input: CardinalityInferenceInput,
): CardinalityInferenceResult | null {
  const { isFk, isUq, isNn, targetIsPk } = input;

  if (!isFk || !targetIsPk) return null;

  // Target is always `one` — PK is NOT NULL + UNIQUE by SQL definition.
  const target: Cardinality = 'one';

  let source: Cardinality;
  let confidence: 'high' | 'medium' | 'low';

  if (isUq && isNn) {
    source = 'one';
    confidence = 'high';
  } else if (isUq && !isNn) {
    source = 'zero_or_one';
    confidence = 'high';
  } else if (!isUq && isNn) {
    source = 'one_or_many';
    confidence = 'medium';
  } else {
    source = 'zero_or_many';
    confidence = 'medium';
  }

  return { source, target, confidence };
}
