import { memo, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
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
// Self-reference arc geometry
// ────────────────────────────────────────────────────────────────────

/**
 * Build an SVG path string for a self-ref loop. Starts at (sx, sy),
 * arcs clockwise into a small top-right loop, lands back near the
 * start. Kept pure + exported so S6-U20 can snapshot a known geometry.
 */
export function selfRefPath(sx: number, sy: number): string {
  const radius = 40;
  const startX = sx + 10;
  const startY = sy - 4;
  const endX = sx - 4;
  const endY = sy - 10;
  // Two quarter-arc segments forming an ear-shaped loop above+right of
  // the anchor. Sweep flag 1 → clockwise.
  const arc1X = startX + radius;
  const arc1Y = startY - radius;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${arc1X} ${arc1Y} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
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
  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let srcAngleDeg = 0;
  let tgtAngleDeg = 180;

  if (isSelfRef) {
    edgePath = selfRefPath(sourceX, sourceY);
    labelX = sourceX + 44;
    labelY = sourceY - 44;
    srcAngleDeg = 0;
    tgtAngleDeg = 90;
  } else {
    const [bezierPath, bLabelX, bLabelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = bezierPath;
    labelX = bLabelX;
    labelY = bLabelY;
    // Angle of the straight-line approximation is close enough for
    // glyph orientation. Exact tangent would require sampling the bezier.
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Source glyph points outward from source (opposite of bearing).
    srcAngleDeg = angle + 180;
    tgtAngleDeg = angle;
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
          strokeWidth: 2,
          strokeDasharray: dashArray,
          opacity: shimmer ? 0.85 : 1,
          transition: 'opacity 200ms ease',
        }}
      />
      {/* Source-end glyph */}
      <GlyphMarker
        x={sourceX}
        y={sourceY}
        angleDeg={srcAngleDeg}
        glyph={srcGlyph}
        identifying={d.isIdentifying}
        testId={`rel-glyph-source-${id}`}
      />
      {/* Target-end glyph */}
      <GlyphMarker
        x={isSelfRef ? sourceX - 20 : targetX}
        y={isSelfRef ? sourceY - 40 : targetY}
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
        <line x1={-14} y1={-6} x2={-14} y2={6} stroke={stroke} strokeWidth={2} data-glyph="bar" />
      )}
      {glyph.crowsFoot && (
        <g data-glyph="crows-foot" stroke={stroke} strokeWidth={1.8} fill="none">
          <line x1={-4} y1={0} x2={-14} y2={-7} />
          <line x1={-4} y1={0} x2={-14} y2={0} />
          <line x1={-4} y1={0} x2={-14} y2={7} />
        </g>
      )}
      {glyph.filledCircle && (
        <circle cx={-18} cy={0} r={3.5} fill={fill} stroke={stroke} data-glyph="filled-circle" />
      )}
      {glyph.openCircle && (
        <circle
          cx={-22}
          cy={0}
          r={3.5}
          fill="#0B0E13"
          stroke={stroke}
          strokeWidth={1.6}
          data-glyph="open-circle"
        />
      )}
    </g>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
