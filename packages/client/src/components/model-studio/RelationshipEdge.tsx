import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BaseEdge, getSmoothStepPath, Position, useReactFlow, type EdgeProps } from '@xyflow/react';
import type { Cardinality, Notation } from '@cc/shared';

/**
 * Step 6 — custom React Flow edge rendering an IE / IDEF1X cardinality
 * symbol pair + identifying / non-identifying line style.
 *
 * Contract (alignment-step6.md §1, §2 S6-U18/U19/U20):
 *   - Table-driven symbol lookup — no nested switches. Pure functions
 *     `ieSymbol` / `idef1xSymbol` return `{ shape, tail }` for the
 *     source-end and target-end glyphs.
 *   - Identifying → solid 2px stroke. Non-identifying → dashed.
 *   - Self-referential edges (source === target) render as a quarter-
 *     circle arc loop in the top-right of the source node.
 *   - D-R1 "newly created" shimmer — amber 1.5s fade on mount.
 *   - D-R2 hover pulse — dispatches `rel:hover` custom event so the
 *     endpoint entity borders can pulse. Mirrors SyntheticDataDrawer
 *     visual vocabulary (amber glow + stroke).
 *   - D-R3 context menu — right-click opens `EdgeContextMenu` via a
 *     custom event dispatched to the parent canvas.
 *
 * Edge `data` is stamped by ModelStudioCanvas from the Relationship row
 * before the edge reaches React Flow.
 */

export type CardinalityEnd = 'source' | 'target';

/**
 * Relationship edge payload surfaced via React Flow `data` channel.
 * Kept loose (Record<string, unknown>) so it satisfies the library's
 * generic edge-data constraint without forcing every consumer to import
 * the entire Relationship shape.
 */
export interface RelationshipEdgeData extends Record<string, unknown> {
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  isIdentifying: boolean;
  notation: Notation;
  isSelfRef: boolean;
  /** When true, apply D-R1 amber shimmer for ~1.5s then fade. */
  isNewlyCreated?: boolean;
  /** Entity ids — needed for the rel:hover event broadcast so endpoint
   *  EntityNodes can pulse their border (D-R2). */
  sourceEntityId: string;
  targetEntityId: string;
  /** Relationship id so right-click can open the correct menu / panel. */
  relId: string;
  /** Forward verb phrase (e.g. "manages"). Rendered centred on the
   *  source-half of the line when both verbs are set, otherwise centred
   *  on the whole line. */
  verbForward?: string | null;
  /** Inverse verb phrase (e.g. "is_managed_by"). When present with
   *  verbForward, the two labels split the line in half. */
  verbInverse?: string | null;
  /** User-authored waypoints in flow-space coords. When present, the
   *  edge renders straight segments through them instead of React
   *  Flow's default smooth-step routing. Shift+click a waypoint to
   *  remove it; double-click on the edge path to insert one. */
  waypoints?: Array<{ x: number; y: number }>;
  /** Optimistic-lock token — required on any metadata PATCH that
   *  persists waypoint drags. */
  relVersion?: number;
  /** Full relationship metadata bag (read-only). Merged with the new
   *  waypoints array when persisting so other keys survive. */
  relMetadata?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────
// Symbol tables — pure lookups keyed on cardinality. No nesting.
//
// Each entry returns a small SVG fragment description we render at the
// cardinality glyph's anchor point. Coordinates are local to the glyph
// (0 at the anchor); the renderer translates + rotates them to align
// with the edge tangent. This decoupling is what makes the table
// "table-driven" per the brief (S6-U18 snapshot stability depends on
// each enum mapping to a deterministic markup).
// ────────────────────────────────────────────────────────────────────

export interface CardinalityGlyph {
  /** Vertical bar (|) — "one" semantics. */
  bar: boolean;
  /** Open circle (○) — "zero" semantics. */
  openCircle: boolean;
  /** Filled circle (●) — IDEF1X "many" end. */
  filledCircle: boolean;
  /** Crow's-foot (trident) — IE "many" end. */
  crowsFoot: boolean;
}

const EMPTY_GLYPH: CardinalityGlyph = {
  bar: false,
  openCircle: false,
  filledCircle: false,
  crowsFoot: false,
};

/** IE lookup. Crow's foot for many; bar for one; open circle + bar
 *  combinations for zero-or-* variants. */
const IE_TABLE: Record<Cardinality, CardinalityGlyph> = {
  one: { ...EMPTY_GLYPH, bar: true },
  many: { ...EMPTY_GLYPH, crowsFoot: true },
  zero_or_one: { ...EMPTY_GLYPH, bar: true, openCircle: true },
  zero_or_many: { ...EMPTY_GLYPH, crowsFoot: true, openCircle: true },
  one_or_many: { ...EMPTY_GLYPH, crowsFoot: true, bar: true },
};

/** IDEF1X lookup. Filled circle for many; bar for one. Null/optional
 *  variants use an open circle modifier. */
const IDEF1X_TABLE: Record<Cardinality, CardinalityGlyph> = {
  one: { ...EMPTY_GLYPH, bar: true },
  many: { ...EMPTY_GLYPH, filledCircle: true },
  zero_or_one: { ...EMPTY_GLYPH, bar: true, openCircle: true },
  zero_or_many: { ...EMPTY_GLYPH, filledCircle: true, openCircle: true },
  one_or_many: { ...EMPTY_GLYPH, filledCircle: true, bar: true },
};

export function ieSymbol(cardinality: Cardinality): CardinalityGlyph {
  return IE_TABLE[cardinality];
}

export function idef1xSymbol(cardinality: Cardinality): CardinalityGlyph {
  return IDEF1X_TABLE[cardinality];
}

// ────────────────────────────────────────────────────────────────────
// Handle-direction → glyph rotation
//
// For orthogonal (smoothstep) routing the edge leaves the card along
// the handle's axis. The glyph group is drawn with markers at negative
// local-x coordinates (bar at x=-14, crows-foot fanning out to x=-14,
// circles at x=-18/-22). Rotating the group so its local -x axis
// points OUTWARD from the card places every glyph in the card's
// exterior rather than inside/behind the entity card border (which
// was the #2 root cause when combined with bezier's inward tangent).
// ────────────────────────────────────────────────────────────────────

export function outwardAngleFor(position: Position): number {
  // Rotation maps local (−1, 0) onto the outward direction.
  // Right handle: outward = +x  → rotate 180°
  // Left  handle: outward = −x  → rotate   0°
  // Top   handle: outward = −y  → rotate  90°
  // Bottom handle: outward = +y → rotate −90°
  switch (position) {
    case Position.Right:
      return 180;
    case Position.Left:
      return 0;
    case Position.Top:
      return 90;
    case Position.Bottom:
      return -90;
    default:
      return 0;
  }
}

/** Snap the tangent from (ax,ay) → (bx,by) to the nearest cardinal
 *  direction and return the rotation angle that orients a glyph
 *  outward from the endpoint. Used by the waypoint-routed path where
 *  we don't have a React Flow `Position` to read. */
export function axisAngleToward(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 180 : 0; // outward = opposite of tangent direction
  }
  return dy >= 0 ? -90 : 90;
}

/** Waypoint grid cell size (flow-space units). Dragging a waypoint
 *  snaps its centre to the nearest multiple of this so rerouted lines
 *  land on the same grid as the dot background — matches Erwin /
 *  ER Studio cleanup expectations. */
export const WAYPOINT_GRID = 10;

export function snapToGrid(n: number): number {
  return Math.round(n / WAYPOINT_GRID) * WAYPOINT_GRID;
}

/** Distance (in flow units) within which two consecutive waypoints
 *  collapse into one on save. Matches `WP_HIT_PX` used by the drag
 *  handler: if a click-drag within this radius of an existing
 *  waypoint would have grabbed that waypoint (not inserted a new
 *  one), two waypoints that close to each other in storage are
 *  effectively duplicates. Dedup cleans up legacy data captured
 *  before the grab radius was widened. */
export const WP_DEDUP_THRESHOLD = 30;

/** Collapse consecutive waypoints that sit within WP_DEDUP_THRESHOLD
 *  of each other into a single waypoint (keeping the first of each
 *  cluster — subsequent ones are considered stale drop points from a
 *  "drag again to refine" gesture that didn't grab the prior
 *  waypoint). Runs at persist-time so users don't accumulate a
 *  staircase of junk waypoints when a route is adjusted repeatedly. */
export function dedupWaypoints(
  waypoints: Array<{ x: number; y: number }>,
  threshold: number = WP_DEDUP_THRESHOLD,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const wp of waypoints) {
    const last = out[out.length - 1];
    if (last && Math.hypot(wp.x - last.x, wp.y - last.y) < threshold) continue;
    out.push(wp);
  }
  return out;
}

/** Build the SVG sub-path from p0 to p1 as an orthogonal L-shape
 *  (horizontal-first when dx ≥ dy, vertical-first otherwise). If the
 *  two points already share an axis, renders a straight line. Erwin /
 *  ER Studio relationship lines are strictly orthogonal — diagonal
 *  segments between bend points read as sloppy on a data-model
 *  diagram. */
export function orthogonalSegment(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
): string {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (dx === 0 || dy === 0) return `L ${p1.x} ${p1.y}`;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal-first L: (p0) → (p1.x, p0.y) → (p1.x, p1.y)
    return `L ${p1.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }
  // Vertical-first L: (p0) → (p0.x, p1.y) → (p1.x, p1.y)
  return `L ${p0.x} ${p1.y} L ${p1.x} ${p1.y}`;
}

/** Stub length in flow units — how far the line extends outward from
 *  the handle before making its first bend toward a user waypoint.
 *  Matches the cardinality-glyph visual length so the glyph sits on
 *  the straight stub segment and its tangent is unambiguously
 *  outward-pointing regardless of where the first waypoint landed. */
export const STUB_LEN = 20;

/** Outward displacement vector for the stub segment extending from a
 *  handle of the given Position. Values match `outwardAngleFor` so
 *  the stub direction and the glyph rotation always agree. */
export function outwardStubDelta(position: Position): { dx: number; dy: number } {
  switch (position) {
    case Position.Right:
      return { dx: STUB_LEN, dy: 0 };
    case Position.Left:
      return { dx: -STUB_LEN, dy: 0 };
    case Position.Top:
      return { dx: 0, dy: -STUB_LEN };
    case Position.Bottom:
      return { dx: 0, dy: STUB_LEN };
    default:
      return { dx: 0, dy: 0 };
  }
}

/** Build an L-shape from a handle-adjacent stub point `from` to a
 *  waypoint `to`, forcing the FIRST move to be PERPENDICULAR to the
 *  handle's outward axis. This prevents the pathological "line
 *  backtracks through the entity card" route that a generic
 *  `orthogonalSegment` produces when the waypoint is behind the
 *  handle. Using this for both first (stub→wp1) and last
 *  (wpN→stub) segments guarantees the line ALWAYS leaves / enters a
 *  handle along the outward axis, which in turn means the
 *  cardinality glyph (rotated by the handle's cardinal direction)
 *  stays visually attached to the line.
 */
export function stubToAnchor(
  outwardAxis: 'horizontal' | 'vertical',
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return `L ${to.x} ${to.y}`;
  if (outwardAxis === 'horizontal') {
    // Handle's outward was horizontal → move PERPENDICULAR (vertical) first.
    return `L ${from.x} ${to.y} L ${to.x} ${to.y}`;
  }
  // Handle's outward was vertical → move horizontal first.
  return `L ${to.x} ${from.y} L ${to.x} ${to.y}`;
}

/** Which axis is the handle's outward direction on? */
export function outwardAxis(position: Position): 'horizontal' | 'vertical' {
  return position === Position.Left || position === Position.Right ? 'horizontal' : 'vertical';
}

// ────────────────────────────────────────────────────────────────────
// Self-reference arc geometry
// ────────────────────────────────────────────────────────────────────

/**
 * Build an SVG path string for a self-ref loop.
 *
 * Erwin / ER Studio convention: self-ref loops are 3-segment orthogonal
 * corridors on the RIGHT side of the entity. Our canvas routes self-ref
 * edges `right-top` (source) → `right-bottom` (target) — both handles
 * sit on the right edge of the same entity, so the loop is drawn by
 * stepping right from the source, dropping vertically to the target's
 * Y, then stepping back left into the target. No curves; pure right
 * angles, which reads unambiguously at any zoom level and mirrors the
 * conventions a CDMP practitioner recognises from Erwin.
 *
 *    (sx, sy) ─► right 30px ──┐
 *                             │  (vertical corridor)
 *    (tx, ty) ◄── right 30px ─┘
 *
 * The exported signature stays `(sx, sy, tx, ty) → string` so callers
 * and tests are unaffected; only the path body changes.
 */
export function selfRefPath(sx: number, sy: number, tx: number, ty: number): string {
  const bulge = 30;
  return `M ${sx} ${sy} L ${sx + bulge} ${sy} L ${tx + bulge} ${ty} L ${tx} ${ty}`;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

function RelationshipEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } =
    props;
  // RelationshipEdge is only registered on edges built by
  // ModelStudioCanvas's edges memo, which ALWAYS sets `data`. Treat d
  // as non-nullable so every hook below sits above a single early
  // return would otherwise put them on the wrong side of — and
  // satisfies react-hooks/rules-of-hooks without a defensive branch
  // React Flow cannot actually trigger.
  const d = data as unknown as RelationshipEdgeData;

  // Newly-created shimmer — D-R1. One-shot CSS class that the browser
  // removes after the animation finishes. Ref on the <g> so we can flip
  // the class without re-entering React on every animation frame.
  const [shimmer, setShimmer] = useState(Boolean(d.isNewlyCreated));
  const shimmerStart = useRef<number>(Date.now());
  useEffect(() => {
    if (!d.isNewlyCreated) return;
    shimmerStart.current = Date.now();
    setShimmer(true);
    const t = setTimeout(() => setShimmer(false), 1500);
    return () => clearTimeout(t);
  }, [d.isNewlyCreated]);

  const isSelfRef = d.isSelfRef;
  const notation = d.notation;
  const rf = useReactFlow();
  // Local preview of waypoints during drag so the path updates every
  // mouse-move without waiting for server round-trips. Re-synced when
  // props change (persisted state arrives back). Declared ABOVE path
  // calc so the `else if (currentWaypoints.length > 0)` branch can
  // see the drag-preview values.
  const [localWaypoints, setLocalWaypoints] = useState<Array<{ x: number; y: number }> | null>(
    null,
  );
  const currentWaypoints = localWaypoints ?? d.waypoints ?? [];
  const srcGlyph =
    notation === 'ie' ? ieSymbol(d.sourceCardinality) : idef1xSymbol(d.sourceCardinality);
  const tgtGlyph =
    notation === 'ie' ? ieSymbol(d.targetCardinality) : idef1xSymbol(d.targetCardinality);

  // Path geometry.
  //
  // #2 decision — orthogonal `getSmoothStepPath` replaces the bezier.
  // Smoothstep leaves each endpoint along its handle's axis, which
  // means the glyph tangent is deterministic (always axis-aligned)
  // and matches the direction of the line leaving the card. That in
  // turn lets us rotate the glyph so it renders OUTSIDE the card
  // rather than behind it.
  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let srcAngleDeg = 0;
  let tgtAngleDeg = 180;

  if (isSelfRef) {
    edgePath = selfRefPath(sourceX, sourceY, targetX, targetY);
    // 3-segment orthogonal corridor: both endpoints sit on the right
    // edge (source at right-top, target at right-bottom). The label
    // sits centred in the vertical corridor between them.
    const bulge = 30;
    labelX = (sourceX + targetX) / 2 + bulge;
    labelY = (sourceY + targetY) / 2;
    // Both endpoints emerge on the right edge of the entity; rotate
    // each glyph 180° so the bar / crows-foot / circle markers extend
    // outward (positive x, into the corridor) rather than inward into
    // the card body.
    srcAngleDeg = 180;
    tgtAngleDeg = 180;
  } else if (currentWaypoints.length > 0) {
    // User-routed — orthogonal L-segments through each waypoint with
    // a 20px stub at each end. The stub is collinear with the handle's
    // outward direction, so the cardinality glyph (rotated by the
    // handle's cardinal) visually sits on a line segment that moves
    // in that same direction — no more "stuck glyph" when a waypoint
    // is placed behind the handle. Middle segments use the generic
    // `orthogonalSegment` heuristic, so normal waypoint placements
    // produce clean V/U dips rather than forced perpendicular zigzags.
    const srcDelta = outwardStubDelta(sourcePosition);
    const tgtDelta = outwardStubDelta(targetPosition);
    const srcStub = { x: sourceX + srcDelta.dx, y: sourceY + srcDelta.dy };
    const tgtStub = { x: targetX + tgtDelta.dx, y: targetY + tgtDelta.dy };

    const pts = [
      { x: sourceX, y: sourceY },
      srcStub,
      ...currentWaypoints,
      tgtStub,
      { x: targetX, y: targetY },
    ];
    const segments: string[] = [`M ${pts[0].x} ${pts[0].y}`];
    for (let i = 1; i < pts.length; i += 1) {
      segments.push(orthogonalSegment(pts[i - 1], pts[i]));
    }
    edgePath = segments.join(' ');

    // Label: midpoint of the middle user waypoint span (not the stubs).
    const firstWp = currentWaypoints[0];
    const lastWp = currentWaypoints[currentWaypoints.length - 1];
    const midIdx = Math.max(0, Math.floor(currentWaypoints.length / 2) - 1);
    const labelA = currentWaypoints[midIdx] ?? firstWp;
    const labelB = currentWaypoints[midIdx + 1] ?? lastWp;
    labelX = (labelA.x + labelB.x) / 2;
    labelY = (labelA.y + labelB.y) / 2;

    // Glyph rotations still use the handle's outward cardinal direction.
    // The 20px stub at each end is colinear with that direction, so the
    // glyph's visual tangent matches the line's tangent at the handle.
    srcAngleDeg = outwardAngleFor(sourcePosition);
    tgtAngleDeg = outwardAngleFor(targetPosition);
  } else {
    const [smoothPath, sLabelX, sLabelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });
    edgePath = smoothPath;
    labelX = sLabelX;
    labelY = sLabelY;
    // With orthogonal routing the path leaves each endpoint along the
    // handle's axis. Use the handle position to produce an exact
    // outward-pointing tangent. Glyph markup lives on negative-x
    // local coords, so rotating the glyph group by `outwardAngle`
    // projects the glyph OUTSIDE the card.
    srcAngleDeg = outwardAngleFor(sourcePosition);
    tgtAngleDeg = outwardAngleFor(targetPosition);
  }

  // Erwin-style visual grammar: both kinds of relationship share one
  // neutral colour; the distinction between identifying and
  // non-identifying is carried by line weight + solid/dashed. Amber
  // is reserved for selection glow + newly-created shimmer so
  // practitioners can scan a dense model without every line screaming
  // for attention.
  const stroke = '#8FA3B7';
  const dashArray = d.isIdentifying ? undefined : '3 3';

  const dispatchHover = (entering: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('rel:hover', {
        detail: {
          relId: d.relId,
          sourceEntityId: d.sourceEntityId,
          targetEntityId: d.targetEntityId,
          entering,
        },
      }),
    );
  };

  const dispatchContext = (clientX: number, clientY: number) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('rel:context-menu', {
        detail: { relId: d.relId, x: clientX, y: clientY },
      }),
    );
  };

  /** Fire-and-forget persist — ModelStudioCanvas listens on
   *  `rel:waypoints-change` and dispatches the rel.update + attrs
   *  refresh. We don't await here to keep drag response snappy. */
  const persistWaypoints = (nextWaypoints: Array<{ x: number; y: number }>) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('rel:waypoints-change', {
        detail: {
          relId: d.relId,
          waypoints: nextWaypoints,
          version: d.relVersion ?? 1,
          metadata: d.relMetadata ?? {},
        },
      }),
    );
  };

  /**
   * Erwin / ER Studio bend-on-drag pattern. The edge LINE is the
   * interaction surface — no visible handles at rest. Semantics:
   *
   *   - mouse-down + release without movement  → fall through to
   *     React Flow's onClick (selects + opens panel, the existing
   *     muscle memory).
   *   - mouse-down + drag past threshold       → begin bend. If the
   *     initial point is within WP_HIT_PX of an existing waypoint,
   *     drag THAT waypoint. Otherwise insert a new one at the start
   *     position and drag it.
   *   - pointer-up after drag                   → persist via PATCH,
   *     stopPropagation so the click-panel handler doesn't fire.
   *
   * Keeps selection/panel behaviour unchanged for casual use and
   * surfaces bending as a natural "click anywhere on the line and
   * move" gesture. Matches ER Studio's "move the cursor over the
   * line at the point where you want to create the bend, then click
   * and drag" docs exactly.
   */
  const DRAG_THRESHOLD_PX = 3;
  // Distance (in flow-space units) within which a click-drag on the
  // line will GRAB an existing waypoint instead of inserting a new one.
  // 10px was too tight — re-dragging to "clean up" a route accumulated
  // 3+ redundant waypoints at past drop points, producing zigzag
  // paths. 30px lets users re-grab the same waypoint reliably on a
  // second pass; they can still create a new waypoint by clicking
  // anywhere 30px+ away from existing ones.
  const WP_HIT_PX = 30;

  const beginLineDrag = useCallback(
    (startEvent: React.PointerEvent<SVGPathElement>) => {
      if (startEvent.button !== 0 || isSelfRef) return;
      // Don't preventDefault upfront — that would block React Flow's
      // click handling if the user hasn't actually dragged yet.
      const startScreen = { x: startEvent.clientX, y: startEvent.clientY };
      const startFlow = rf.screenToFlowPosition(startScreen);
      const target = startEvent.currentTarget;
      const pointerId = startEvent.pointerId;
      let moved = false;
      let activeIdx: number | null = null;

      // Capture immediately so pointermove/up fire on `target` even
      // when the pointer strays off the (14px-wide but invisible)
      // interaction path mid-drag. Without this, pressing on the
      // line and moving 4px of vertical travel would escape the hit
      // region and the drag would die silently.
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* environments without pointer capture still work via document listeners */
      }

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startScreen.x;
        const dy = ev.clientY - startScreen.y;
        const dist = Math.hypot(dx, dy);
        if (!moved) {
          if (dist < DRAG_THRESHOLD_PX) return;
          moved = true;
          // Decide: grabbing an existing waypoint, or inserting a new one?
          let nearestIdx: number | null = null;
          let nearestDist = Infinity;
          for (let i = 0; i < currentWaypoints.length; i += 1) {
            const wp = currentWaypoints[i];
            const d = Math.hypot(wp.x - startFlow.x, wp.y - startFlow.y);
            if (d < nearestDist) {
              nearestDist = d;
              nearestIdx = i;
            }
          }
          if (nearestIdx !== null && nearestDist <= WP_HIT_PX) {
            activeIdx = nearestIdx;
          } else {
            // Insert a new waypoint at the closest segment index to
            // keep ordering stable along the source→target polyline.
            const pts = [
              { x: sourceX, y: sourceY },
              ...currentWaypoints,
              { x: targetX, y: targetY },
            ];
            let insertAt = currentWaypoints.length;
            let bestSegDist = Infinity;
            for (let i = 0; i < pts.length - 1; i += 1) {
              const sx = pts[i].x;
              const sy = pts[i].y;
              const ex = pts[i + 1].x;
              const ey = pts[i + 1].y;
              const segDx = ex - sx;
              const segDy = ey - sy;
              const len2 = segDx * segDx + segDy * segDy || 1;
              const t = Math.max(
                0,
                Math.min(1, ((startFlow.x - sx) * segDx + (startFlow.y - sy) * segDy) / len2),
              );
              const px = sx + t * segDx;
              const py = sy + t * segDy;
              const dd = (startFlow.x - px) ** 2 + (startFlow.y - py) ** 2;
              if (dd < bestSegDist) {
                bestSegDist = dd;
                insertAt = i;
              }
            }
            const next = [
              ...currentWaypoints.slice(0, insertAt),
              { x: snapToGrid(startFlow.x), y: snapToGrid(startFlow.y) },
              ...currentWaypoints.slice(insertAt),
            ];
            activeIdx = insertAt;
            setLocalWaypoints(next);
          }
        }
        // Live-update the dragged waypoint position.
        const flow = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        setLocalWaypoints((prev) => {
          const base = prev ?? currentWaypoints;
          const next = base.slice();
          if (activeIdx === null) return base;
          next[activeIdx] = { x: snapToGrid(flow.x), y: snapToGrid(flow.y) };
          return next;
        });
      };

      const up = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* capture may have never been established */
        }
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
        if (moved) {
          // Stop the click handler on the parent <g> from firing —
          // dragging and selecting shouldn't happen in one gesture.
          ev.stopPropagation();
          ev.preventDefault();
          setLocalWaypoints((finalState) => {
            if (!finalState) return finalState;
            // Collapse consecutive close-together waypoints. Cleans up
            // legacy zigzag data from drag-to-refine sessions made
            // before WP_HIT_PX was widened to 30px.
            const deduped = dedupWaypoints(finalState);
            persistWaypoints(deduped);
            return deduped;
          });
        }
        // If NOT moved → do nothing here. React Flow's onClick fires
        // as usual and the parent handles selection/panel policy.
      };

      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rf, currentWaypoints, isSelfRef, sourceX, sourceY, targetX, targetY, d.relId, d.relVersion],
  );

  // Double-click on the edge line used to insert a waypoint; the
  // Erwin-style click-drag gesture above now owns bend creation, so
  // there's no double-click binding on the edge anymore. Keeping an
  // empty stub would only confuse future readers — the onDoubleClick
  // prop is simply removed below.

  return (
    <g
      data-testid={`relationship-edge-${id}`}
      data-notation={notation}
      data-identifying={d.isIdentifying ? 'true' : 'false'}
      data-self-ref={isSelfRef ? 'true' : 'false'}
      data-newly-created={shimmer ? 'true' : 'false'}
      className={[
        'react-flow__edge-group',
        shimmer ? 'animate-[pulse_1.5s_ease-out]' : '',
        selected ? 'drop-shadow-[0_0_6px_rgba(255,214,10,0.6)]' : '',
      ].join(' ')}
      onMouseEnter={() => dispatchHover(true)}
      onMouseLeave={() => dispatchHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dispatchContext(e.clientX, e.clientY);
      }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          // Erwin-parity stroke weights — lighter than our pre-refresh
          // numbers so a dense diagram reads like a schematic, not a
          // highlighter sketch. Identifying stays visibly thicker so
          // parent→weak-child hierarchy is still spottable at a glance.
          strokeWidth: d.isIdentifying ? 1.75 : 1.1,
          strokeDasharray: dashArray,
          opacity: shimmer ? 0.85 : 1,
          transition: 'opacity 200ms ease',
          // The "move" cursor on the line hints the stroke itself is
          // draggable (Erwin / ER Studio bend-on-drag). Single click
          // still falls through to React Flow's onClick and opens the
          // properties panel; the drag gesture only triggers when the
          // pointer moves past a 3px threshold after pointerdown.
          cursor: 'move',
        }}
      />
      {/* Invisible-but-wide interaction path stacked over the
          visible stroke. Painted with `stroke-opacity=0` rather than
          `stroke="transparent"` — some browsers (notably Chromium
          with certain stacking contexts) treat a fully transparent
          stroke as non-interactive. An opaque-colour + 0 opacity
          stroke is unambiguously paintable and reliably receives
          pointer events. */}
      <path
        data-testid={`rel-interaction-${id}`}
        d={edgePath}
        fill="none"
        stroke="#000"
        strokeOpacity={0}
        strokeWidth={14}
        style={{ cursor: 'move', pointerEvents: 'stroke' }}
        onPointerDown={beginLineDrag}
      />
      {/* Source-end glyph — anchored at the actual source handle
          (right-edge midpoint for self-ref; outward-facing edge
          midpoint for non-self-ref). srcAngleDeg rotates the glyph so
          the bar / crow's-foot extends OUTWARD (away from the card). */}
      <GlyphMarker
        x={sourceX}
        y={sourceY}
        angleDeg={srcAngleDeg}
        glyph={srcGlyph}
        identifying={d.isIdentifying}
        testId={`rel-glyph-source-${id}`}
      />
      {/* Target-end glyph — anchored at the actual target handle. For
          self-ref that's the top-edge midpoint; tgtAngleDeg rotates
          the glyph so markers extend UP (away from the card). */}
      <GlyphMarker
        x={targetX}
        y={targetY}
        angleDeg={tgtAngleDeg}
        glyph={tgtGlyph}
        identifying={d.isIdentifying}
        testId={`rel-glyph-target-${id}`}
      />
      {/* Cardinality text labels — Erwin-style `1..*`, `0..1`, etc.
          (IE) or federal-standard letters `Z`, `P`, `M`, `1` (IDEF1X).
          Not rendered on the canvas — the glyph (crow's foot, bar,
          circle) IS the cardinality. Duplicating it as text clutters
          dense diagrams and overlaps verb labels. Senior modellers
          read the glyph directly; we keep `formatCardinalityText`
          available for the properties panel + DDL export. */}
      {/* Verb phrases — forward (rel.name) + inverse (rel.inverseName).
          When both are set, each label sits at the midpoint of its own
          half of the line so the reader can parse the relationship in
          either direction without rotating their head. When only one
          is set, fall back to a single centred label (the pre-Step-6
          behaviour). */}
      <VerbPhraseLabels
        forward={d.verbForward ?? (typeof d.name === 'string' ? d.name : null)}
        inverse={d.verbInverse ?? null}
        sourceX={sourceX}
        sourceY={sourceY}
        targetX={targetX}
        targetY={targetY}
        isSelfRef={isSelfRef}
        labelX={labelX}
        labelY={labelY}
        edgeId={id}
      />
      {/* No visible waypoint handles — Erwin / ER Studio style.
          Bends live in the line geometry; grabbing one means clicking
          on the line near the existing waypoint and dragging. New
          waypoints are inserted at the click position of the first
          drag-past-threshold motion. To strip all waypoints, use the
          edge right-click menu → "Reset path". */}
    </g>
  );
}

// `CardinalityTextLabel` was removed — see the canvas-render block
// above for the rationale. The cardinality glyph IS the cardinality in
// IE/IDEF1X notation; adding text next to every endpoint duplicated
// the read and overlapped verb-phrase labels on dense diagrams.
// `formatCardinalityText` stays exported from `@cc/shared` for the
// properties panel + DDL export.

/**
 * Render verb phrase labels for a relationship.
 *
 * - Both verbs set → forward label on source-half midpoint, inverse on
 *   target-half midpoint.
 * - Only forward set → single label centred on the line (legacy
 *   behaviour, preserved for self-refs and rels with no inverse).
 * - Neither set → nothing rendered.
 */
function VerbPhraseLabels({
  forward,
  inverse,
  sourceX,
  sourceY,
  targetX,
  targetY,
  isSelfRef,
  labelX,
  labelY,
  edgeId,
}: {
  forward: string | null;
  inverse: string | null;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isSelfRef: boolean;
  labelX: number;
  labelY: number;
  edgeId: string;
}) {
  const hasForward = typeof forward === 'string' && forward.length > 0;
  const hasInverse = typeof inverse === 'string' && inverse.length > 0;
  if (!hasForward && !hasInverse) return null;

  // Rendered as SVG <text> inside the edge <g> rather than via
  // EdgeLabelRenderer. Keeping the verb phrases in the same SVG tree
  // as the line + glyphs means they participate in the same pan / zoom
  // transform without needing the React Flow viewport portal, and they
  // remain queryable in JSDOM snapshots (EdgeLabelRenderer's portal
  // target doesn't exist in the minimal test harness).

  // Self-ref fallback: put any present verb at the corridor centre.
  // Inverse-only case is rare but supported — still centred.
  if (isSelfRef || !hasInverse || !hasForward) {
    const text = hasForward ? forward : inverse;
    if (text === null) return null;
    return (
      <text
        x={labelX}
        y={labelY}
        fill="#8FA3B7"
        fontSize={10}
        fontFamily="var(--font-mono, ui-monospace, SFMono-Regular, monospace)"
        textAnchor="middle"
        dominantBaseline="middle"
        data-testid={`rel-verb-single-${edgeId}`}
      >
        {text}
      </text>
    );
  }

  // Both verbs present — split the line into halves. Forward sits at
  // the midpoint of the source→midpoint segment; inverse at the
  // midpoint of midpoint→target.
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const fwdX = (sourceX + midX) / 2;
  const fwdY = (sourceY + midY) / 2;
  const invX = (midX + targetX) / 2;
  const invY = (midY + targetY) / 2;
  return (
    <>
      <text
        x={fwdX}
        y={fwdY}
        fill="#8FA3B7"
        fontSize={10}
        fontFamily="var(--font-mono, ui-monospace, SFMono-Regular, monospace)"
        textAnchor="middle"
        dominantBaseline="middle"
        data-testid={`rel-verb-forward-${edgeId}`}
      >
        {forward}
      </text>
      <text
        x={invX}
        y={invY}
        fill="#8FA3B7"
        fontSize={10}
        fontFamily="var(--font-mono, ui-monospace, SFMono-Regular, monospace)"
        textAnchor="middle"
        dominantBaseline="middle"
        data-testid={`rel-verb-inverse-${edgeId}`}
      >
        {inverse}
      </text>
    </>
  );
}

/** Glyph painter — translates + rotates, then draws each enabled marker
 *  at its canonical position. Pure SVG; JSDOM can snapshot every combo. */
function GlyphMarker({
  x,
  y,
  angleDeg,
  glyph,
  identifying,
  testId,
}: {
  x: number;
  y: number;
  angleDeg: number;
  glyph: CardinalityGlyph;
  identifying: boolean;
  testId: string;
}) {
  // Match the edge stroke colour (identifying was amber pre-refresh,
  // now shares the neutral grey-blue — weight + solid stroke carry
  // the identifying signal so the glyph doesn't need to shout).
  const stroke = '#8FA3B7';
  const fill = '#8FA3B7';
  // Glyph stroke slightly heavier than the line it terminates so
  // cardinality reads as a crisp terminator, not a thinning tail.
  const glyphStrokeWidth = identifying ? 1.5 : 1.25;
  // Local geometry note: the <g> is translated to the entity-edge
  // handle (x, y) and rotated so local −x points OUTWARD from the
  // card. All glyph coordinates use negative x so after rotation they
  // extend outside the entity, leaving the line's path inside the
  // entity-relationship corridor untouched.
  return (
    <g transform={`translate(${x} ${y}) rotate(${angleDeg})`} data-testid={testId}>
      {glyph.bar && (
        // Vertical perpendicular line — canonical "one and only one"
        // glyph (Redgate / Creately / Microsoft Visio convention).
        // 14px tall (up from 10) reads as a deliberate terminator
        // instead of a stray tick.
        <line
          x1={-12}
          y1={-7}
          x2={-12}
          y2={7}
          stroke={stroke}
          strokeWidth={glyphStrokeWidth}
          data-glyph="bar"
          strokeLinecap="round"
        />
      )}
      {glyph.crowsFoot && (
        // Three prongs radiating from the line terminus OUTWARD.
        // Apex at (0,0) sits exactly at the entity handle; outer
        // prongs splay ±8 (wider than the old ±6 so the crow's foot
        // reads as three distinct claws rather than an arrowhead).
        // Middle prong shares the same length as the outer ones for
        // visual balance.
        <g
          data-glyph="crows-foot"
          stroke={stroke}
          strokeWidth={glyphStrokeWidth}
          fill="none"
          strokeLinecap="round"
        >
          <line x1={0} y1={0} x2={-14} y2={-8} />
          <line x1={0} y1={0} x2={-14} y2={0} />
          <line x1={0} y1={0} x2={-14} y2={8} />
        </g>
      )}
      {glyph.filledCircle && (
        // IDEF1X "many" terminator — solid disc. r=3 matches the
        // open circle below for visual parity between notations.
        <circle
          cx={-15}
          cy={0}
          r={3}
          fill={fill}
          stroke={stroke}
          strokeWidth={glyphStrokeWidth}
          data-glyph="filled-circle"
        />
      )}
      {glyph.openCircle && (
        // "Zero or …" optionality marker. Sits further out (x=-22)
        // when paired with a bar or crow's foot so the two
        // terminators don't visually merge.
        <circle
          cx={-22}
          cy={0}
          r={3}
          fill="#0B0E13"
          stroke={stroke}
          strokeWidth={glyphStrokeWidth}
          data-glyph="open-circle"
        />
      )}
    </g>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
