import type { Cardinality, Notation } from './model-studio.schemas.js';

/**
 * Step 6 Direction A — cardinality text labels rendered next to each
 * endpoint glyph on a relationship edge.
 *
 * The glyph alone (crow's foot, bar, circle, filled dot) is enough for
 * a practitioner who has internalised the notation, but the small text
 * label matches the convention of Erwin / ER Studio / PowerDesigner
 * and removes ambiguity during whiteboard reviews — especially for
 * mixed-seniority teams where a junior analyst may only recognise
 * two of the five cardinalities at sight.
 *
 * IE notation (Information Engineering, Erwin-dialect):
 *   - `1..1` exactly one
 *   - `0..1` zero or one
 *   - `1..*` one or many (mandatory many)
 *   - `0..*` zero or many (optional many)
 *   - `many` is rendered as `1..*` — IE does not distinguish
 *     "many without explicit lower bound" from `one_or_many`.
 *
 * IDEF1X (federal-standard letters, ICAM IDEF1X-93):
 *   - `1`  exactly one
 *   - `Z`  zero-or-one / zero-or-more (ambiguous by spec — the glyph
 *          differentiates; the letter is shared)
 *   - `M`  many (one-to-many, mandatory)
 *   - `P`  one-or-more (positive cardinality)
 */

const IE_TEXT: Record<Cardinality, string> = {
  one: '1..1',
  zero_or_one: '0..1',
  many: '1..*',
  zero_or_many: '0..*',
  one_or_many: '1..*',
};

const IDEF1X_TEXT: Record<Cardinality, string> = {
  one: '1',
  zero_or_one: 'Z',
  many: 'M',
  zero_or_many: 'Z',
  one_or_many: 'P',
};

/**
 * Pure text label for a cardinality under a given notation. No SVG,
 * no React — string in, string out. Callers render this next to the
 * endpoint glyph with 10px monospace muted text.
 */
export function formatCardinalityText(card: Cardinality, notation: Notation): string {
  if (notation === 'ie') return IE_TEXT[card];
  return IDEF1X_TEXT[card];
}
