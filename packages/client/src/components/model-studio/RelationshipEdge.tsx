import { memo, useEffect, useRef, useState } from 'react';
import { BaseEdge, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';
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
          // Identifying relationships are visually heavier — a senior
          // CDMP eye should spot the parent→weak-child hierarchy at a
          // glance, matching Erwin / ER Studio stroke weights.
          strokeWidth: d.isIdentifying ? 2.25 : 1.4,
          strokeDasharray: dashArray,
          opacity: shimmer ? 0.85 : 1,
          transition: 'opacity 200ms ease',
        }}
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
