import { memo, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
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

// ────────────────────────────────────────────────────────────────────
// Self-reference arc geometry
// ────────────────────────────────────────────────────────────────────

/**
 * Build an SVG path string for a self-ref loop.
 *
 * React Flow gives us `(sx, sy)` at the handle position on the card
 * edge. Drawing a loop tangent to that point puts half the loop INSIDE
 * the entity card and hidden behind it. Instead we project the loop
 * OUTWARD past the card border and produce a full ear-shaped arc that
 * sits entirely outside the node bounds.
 *
 * The loop is anchored above the source handle and curves up + right
 * so it's visible in the canonical top-right quadrant regardless of
 * whether React Flow routed the same handle or two distinct handles
 * for a source-equals-target edge.
 *
 * Kept pure + exported so S6-U20 can snapshot a known geometry.
 */
export function selfRefPath(sx: number, sy: number): string {
  // Push the anchor clearly outside the card border along the top-right
  // diagonal. Empirically a 14px outward offset clears the 1.25px stroke
  // + entity card border + any selected-glow.
  const outwardOffset = 14;
  const startX = sx + outwardOffset;
  const startY = sy - 4;
  const radius = 22;
  // Two quarter arcs forming a closed-looking ear above and to the
  // right of the source handle. Sweep flag 1 → clockwise.
  const midX = startX + radius;
  const midY = startY - radius;
  const endX = sx + 4;
  const endY = sy - outwardOffset;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${midX} ${midY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

function RelationshipEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } =
    props;
  const d = data as unknown as RelationshipEdgeData | undefined;

  // Newly-created shimmer — D-R1. One-shot CSS class that the browser
  // removes after the animation finishes. Ref on the <g> so we can flip
  // the class without re-entering React on every animation frame.
  const [shimmer, setShimmer] = useState(Boolean(d?.isNewlyCreated));
  const shimmerStart = useRef<number>(Date.now());
  useEffect(() => {
    if (!d?.isNewlyCreated) return;
    shimmerStart.current = Date.now();
    setShimmer(true);
    const t = setTimeout(() => setShimmer(false), 1500);
    return () => clearTimeout(t);
  }, [d?.isNewlyCreated]);

  if (!d) return null;

  const isSelfRef = d.isSelfRef;
  const notation = d.notation;
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
    edgePath = selfRefPath(sourceX, sourceY);
    labelX = sourceX + 44;
    labelY = sourceY - 44;
    // Source glyph aligned with the outward-right tangent at the loop's
    // start; target glyph aligned with the outward-upward tangent at
    // the loop's end so both glyphs render outside the node bounds.
    srcAngleDeg = 0;
    tgtAngleDeg = -90;
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

  const stroke = d.isIdentifying ? 'var(--tw-colors-accent, #FFD60A)' : '#8FA3B7';
  const dashArray = d.isIdentifying ? undefined : '6 4';

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
          strokeWidth: 1.25,
          strokeDasharray: dashArray,
          opacity: shimmer ? 0.85 : 1,
          transition: 'opacity 200ms ease',
        }}
      />
      {/* Source-end glyph — anchored at the card-edge handle, rotated
          so the glyph markers project OUTWARD from the card. For
          self-ref edges the anchor is the start of the loop (sits just
          outside the source handle) so the glyph clears the border. */}
      <GlyphMarker
        x={isSelfRef ? sourceX + 14 : sourceX}
        y={isSelfRef ? sourceY - 4 : sourceY}
        angleDeg={srcAngleDeg}
        glyph={srcGlyph}
        identifying={d.isIdentifying}
        testId={`rel-glyph-source-${id}`}
      />
      {/* Target-end glyph — for non-self-ref edges we use the target
          handle; for self-ref the arc terminates above the source, so
          we anchor the target glyph at the end of the loop and rotate
          it so its markers point UP (away from the card). */}
      <GlyphMarker
        x={isSelfRef ? sourceX + 4 : targetX}
        y={isSelfRef ? sourceY - 14 : targetY}
        angleDeg={tgtAngleDeg}
        glyph={tgtGlyph}
        identifying={d.isIdentifying}
        testId={`rel-glyph-target-${id}`}
      />
      {/* Optional name label */}
      {typeof d.name === 'string' && d.name.length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="rounded border border-white/10 bg-surface-2/80 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary backdrop-blur"
          >
            {String(d.name)}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
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
  const stroke = identifying ? '#FFD60A' : '#8FA3B7';
  const fill = identifying ? '#FFD60A' : '#8FA3B7';
  // Glyph origin sits 12px outside the node along the edge tangent so
  // it doesn't overlap the card border.
  return (
    <g transform={`translate(${x} ${y}) rotate(${angleDeg})`} data-testid={testId}>
      {glyph.bar && (
        <line
          x1={-14}
          y1={-6}
          x2={-14}
          y2={6}
          stroke={stroke}
          strokeWidth={1.25}
          data-glyph="bar"
        />
      )}
      {glyph.crowsFoot && (
        <g data-glyph="crows-foot" stroke={stroke} strokeWidth={1.15} fill="none">
          <line x1={-4} y1={0} x2={-14} y2={-7} />
          <line x1={-4} y1={0} x2={-14} y2={0} />
          <line x1={-4} y1={0} x2={-14} y2={7} />
        </g>
      )}
      {glyph.filledCircle && (
        <circle
          cx={-18}
          cy={0}
          r={3}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.15}
          data-glyph="filled-circle"
        />
      )}
      {glyph.openCircle && (
        <circle
          cx={-22}
          cy={0}
          r={3}
          fill="#0B0E13"
          stroke={stroke}
          strokeWidth={1.15}
          data-glyph="open-circle"
        />
      )}
    </g>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
