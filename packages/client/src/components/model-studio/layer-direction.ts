import type { Layer, LayerCoverageCell } from '@cc/shared';

export type OriginDirection = 'greenfield' | 'existing_system';

/**
 * Step 7 — layer-direction helpers.
 *
 * `originDirection` defines which way the modeller authors:
 *
 *  - **greenfield**: starts at conceptual and projects DOWN
 *    (conceptual → logical → physical).
 *  - **existing_system**: reverse-engineers from the physical schema
 *    UP (physical → logical → conceptual).
 *
 * Two distinct "next layer" concepts live here, intentionally separate
 * because the server's auto-project endpoint only supports greenfield
 * transitions while the modeller's notion of "the next layer I should
 * project to" is symmetric across both origin directions.
 */

/**
 * The modeller's expected next layer per origin direction. Symmetric:
 * works for both greenfield (downward) and existing_system (upward).
 * Used by `isUnlinked` to drive the dashed-border nudge on entity
 * cards. Returns `null` on the terminal layer (physical for
 * greenfield, conceptual for existing_system).
 */
export function expectedNextLayerFor(origin: OriginDirection, current: Layer): Layer | null {
  if (origin === 'greenfield') {
    if (current === 'conceptual') return 'logical';
    if (current === 'logical') return 'physical';
    return null;
  }
  // existing_system
  if (current === 'physical') return 'logical';
  if (current === 'logical') return 'conceptual';
  return null;
}

/**
 * The target layer for AUTO-PROJECTION specifically. Asymmetric —
 * the server's `scaffoldEntity` only supports greenfield directions
 * (conceptual→logical and logical→physical). Reverse directions for
 * existing_system models must use the manual "Link existing entity…"
 * flow via `ProjectToModal`. Returns `null` when auto-project isn't
 * supported for the given (origin, current) pair, which hides the
 * AutoProjectButton without breaking the unlinked-glow nudge.
 */
export function autoProjectTargetFor(origin: OriginDirection, current: Layer): Layer | null {
  if (origin !== 'greenfield') return null;
  if (current === 'conceptual') return 'logical';
  if (current === 'logical') return 'physical';
  return null;
}

/**
 * An entity is "unlinked" when it has NO projection on the layer it's
 * expected to point toward (per the modeller's flow direction).
 * Terminal-layer entities are never unlinked — they sit at the end of
 * the chain by design.
 *
 * Returns false when the cell is undefined (coverage matrix still
 * loading) so the canvas doesn't flash glow on entities whose
 * coverage hasn't arrived yet.
 */
export function isUnlinked(
  origin: OriginDirection,
  current: Layer,
  cell: LayerCoverageCell | undefined,
): boolean {
  const target = expectedNextLayerFor(origin, current);
  if (!target) return false;
  if (!cell) return false;
  return cell[target] === false;
}
