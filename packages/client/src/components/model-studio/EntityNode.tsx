import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Layer, NamingLintRule } from '@cc/shared';
import { OrphanBadge } from './OrphanBadge';
import { EntityHeader } from './EntityHeader';
import { AttributeFlagCell } from './AttributeFlagCell';

/**
 * Custom React Flow node for a Model Studio entity.
 *
 * Step 6 Direction A rewrite — the composer pattern. EntityNode owns
 * hover/selection/rel-hover plumbing and delegates pure visual pieces
 * to `<EntityHeader>` (name + displayId + optional lint underline)
 * and `<AttributeLine>` (which in turn delegates flags to
 * `<AttributeFlagCell>`). The header no longer renders the "P" layer
 * chip or a "no business name" placeholder — Direction A removed both.
 *
 * Handles:
 *   - Four entity-level handles: `top`, `bottom`, `left`, `right-top`
 *     (the old `right` id was split so self-ref edges can route
 *     `right-top → right-bottom` on the same entity). `right-bottom`
 *     is a dedicated target handle stacked below the mid-point at
 *     `top: 70%` so γ's 3-segment orthogonal loop lands on the same
 *     side of the card as Erwin convention expects.
 *   - Per-attribute invisible handles remain as hit targets for
 *     future attribute-to-attribute routing.
 *
 * Conceptual-layer BK branch:
 *   - When `layer === 'conceptual'` AND at least one attribute carries
 *     an `altKeyGroup` AND the only PK is a surrogate (uuid / integer
 *     family), the surrogate PKs are filtered out of the visible
 *     attribute list and the BK attrs form the primary identifier
 *     group. Otherwise PKs render above the divider as they always
 *     have. See `primaryIdentifierAttrIds` helper below.
 */

export interface EntityNodeAttribute {
  id: string;
  name: string;
  dataType: string | null;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  altKeyGroup?: string | null;
  ordinalPosition: number;
}

/** Extends `Record<string, unknown>` so it satisfies React Flow v12's
 *  `Node<T extends Record<string, unknown>>` constraint. */
export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  businessName: string | null;
  layer: Layer;
  lint: NamingLintRule[];
  /** Step 6 Direction A — server-assigned display id (`E001`, …). */
  displayId?: string | null;
  /** Attribute summaries for rendering PKs above the divider and the
   *  remainder below. Undefined when the canvas has not yet loaded
   *  attributes for this entity (lazy-load on panel-open for now). */
  attributes?: EntityNodeAttribute[];
  /** Relationship count for this entity — drives the orphan badge. */
  relCount?: number;
  /** User preference — turned off via canvas header checkbox. */
  showOrphanBadge?: boolean;
  /** Optional descriptive labels keyed by AK group (e.g.
   *  `{AK1: "NI number"}`). Shared across every attribute in the same
   *  group. Surfaced as the tooltip on the AK badge. */
  altKeyLabels?: Record<string, string>;
}

export interface EntityNodeProps extends NodeProps {
  data: EntityNodeData;
}

const MAX_VISIBLE_PER_GROUP = 5;

/** Data types that carry no business meaning on their own — matches
 *  the server-side lint's surrogate list so the conceptual-layer
 *  hide-surrogate-PK branch stays in lock-step with BK linting. */
const SURROGATE_TYPES: ReadonlySet<string> = new Set([
  'uuid',
  'integer',
  'int',
  'int4',
  'int8',
  'bigint',
  'serial',
  'bigserial',
  'smallint',
]);

/**
 * Compute the set of attribute ids that form the entity's primary
 * identifier FOR DISPLAY (not a schema-level concept). On the
 * conceptual layer, when a BK exists AND the only PK is surrogate,
 * the BK is the primary identifier and the surrogate PK is hidden.
 * Returns a tuple of `(primaryIds, shouldHideSurrogatePks)`.
 */
function computePrimaryIdentifier(
  layer: Layer,
  attrs: EntityNodeAttribute[],
): { primaryIds: Set<string>; hideSurrogatePks: boolean } {
  const pkAttrs = attrs.filter((a) => a.isPrimaryKey);
  const akAttrs = attrs.filter(
    (a) => typeof a.altKeyGroup === 'string' && a.altKeyGroup.length > 0,
  );

  // Default — PKs are the primary identifier; surrogate keys stay
  // visible on logical/physical layers.
  if (layer !== 'conceptual') {
    return { primaryIds: new Set(pkAttrs.map((a) => a.id)), hideSurrogatePks: false };
  }
  if (akAttrs.length === 0) {
    return { primaryIds: new Set(pkAttrs.map((a) => a.id)), hideSurrogatePks: false };
  }
  // Conceptual layer + BK exists. If the only PK is surrogate, hide
  // it and promote the BK to primary-identifier status. Composite PKs
  // and natural PKs (e.g. varchar ISBN) stay visible — the PK itself
  // is already the business key in those cases.
  const onlySurrogatePk =
    pkAttrs.length === 1 && SURROGATE_TYPES.has((pkAttrs[0].dataType ?? '').trim().toLowerCase());
  if (!onlySurrogatePk) {
    return { primaryIds: new Set(pkAttrs.map((a) => a.id)), hideSurrogatePks: false };
  }
  return { primaryIds: new Set(akAttrs.map((a) => a.id)), hideSurrogatePks: true };
}

function EntityNodeComponent({ id, data, selected }: EntityNodeProps) {
  const violation = data.lint.find((l) => l.severity === 'violation');

  // D-R2 — listen for rel:hover and pulse the border when this node is
  // an endpoint of the hovered edge.
  const [isEndpointHot, setIsEndpointHot] = useState(false);
  // Hover state drives handle visibility. Uses NATIVE mouseenter/leave via ref
  // because React's synthetic onMouseEnter is eaten by React Flow's node
  // wrapper (which calls stopPropagation on pointer events for its own drag
  // gesture). Native listeners attached to the element directly bypass
  // delegation and fire reliably.
  const [isHovered, setIsHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onEnter = () => setIsHovered(true);
    const onLeave = () => setIsHovered(false);
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onHover = (evt: Event) => {
      const ce = evt as CustomEvent<{
        sourceEntityId?: string;
        targetEntityId?: string;
        entering?: boolean;
      }>;
      const d = ce.detail ?? {};
      const isEndpoint = d.sourceEntityId === id || d.targetEntityId === id;
      if (!isEndpoint) return;
      if (d.entering === false) {
        if (timer) clearTimeout(timer);
        setIsEndpointHot(false);
        return;
      }
      setIsEndpointHot(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setIsEndpointHot(false), 1500);
    };
    window.addEventListener('rel:hover', onHover as EventListener);
    return () => {
      window.removeEventListener('rel:hover', onHover as EventListener);
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const allAttrs = data.attributes ?? [];
  const { primaryIds, hideSurrogatePks } = useMemo(
    () => computePrimaryIdentifier(data.layer, allAttrs),
    [data.layer, allAttrs],
  );

  // Build the visible attribute list. On the conceptual-layer BK
  // branch, surrogate PKs are filtered out entirely so the card reads
  // "name is the identifier here" at a glance.
  const visibleAttrs = useMemo(() => {
    if (!hideSurrogatePks) return allAttrs;
    return allAttrs.filter((a) => !a.isPrimaryKey);
  }, [allAttrs, hideSurrogatePks]);

  // Primary-identifier group (above the divider) = attrs whose id is
  // in `primaryIds`. Non-primary = everything else in the visible set.
  const primaryAttrs = visibleAttrs.filter((a) => primaryIds.has(a.id));
  const nonPrimaryAttrs = visibleAttrs.filter((a) => !primaryIds.has(a.id));
  const hasAttrs = visibleAttrs.length > 0;

  return (
    <div
      ref={rootRef}
      data-testid="entity-node"
      className={[
        // transition-all was animating React Flow's viewport-translate
        // during pan, producing a visible "bouncing" drift. Scope the
        // transitions to JUST the visual properties we actually want
        // to animate (colors + shadow on hover/selected) so the node
        // transform is applied instantly during pan.
        'relative min-w-[180px] max-w-[260px] rounded-xl border backdrop-blur-xl',
        'transition-[box-shadow,border-color,background-color] duration-150 ease-out',
        'bg-surface-2/70 border-white/10 shadow-[0_4px_18px_rgba(0,0,0,0.35)]',
        'hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
        selected
          ? 'ring-2 ring-accent shadow-[0_0_18px_rgba(255,214,10,0.35)] border-accent/40'
          : '',
        isEndpointHot ? 'ring-2 ring-accent animate-pulse' : '',
      ].join(' ')}
    >
      {/*
        Entity-level connect handles — revealed on hover per Infection Virus
        "make you want to touch it". Amber dot with soft glow at each cardinal
        midpoint; invisible until the user hovers the node so the canvas stays
        calm at rest. Click-and-drag from a handle to another entity's handle
        creates a relationship.
      */}
      {/*
        Entity-level handles get stable `id`s so the canvas can route
        self-referential edges (source + target are the same entity) to
        two DIFFERENT anchor points. The old `right` handle id was split
        into `right-top` (source) and `right-bottom` (target) so the
        3-segment orthogonal self-ref loop routes on the right side
        of the entity, matching Erwin convention. See ModelStudioCanvas
        edges memo where `sourceHandle`/`targetHandle` are stamped on
        self-ref edges.
      */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
        style={{
          opacity: isHovered ? 1 : 0,
          boxShadow: '0 0 6px rgba(255,214,10,0.55)',
          transition: 'opacity 120ms ease-out',
        }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
        style={{
          opacity: isHovered ? 1 : 0,
          boxShadow: '0 0 6px rgba(255,214,10,0.55)',
          transition: 'opacity 120ms ease-out',
        }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
        style={{
          opacity: isHovered ? 1 : 0,
          boxShadow: '0 0 6px rgba(255,214,10,0.55)',
          transition: 'opacity 120ms ease-out',
        }}
      />
      <Handle
        id="right-top"
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
        style={{
          opacity: isHovered ? 1 : 0,
          boxShadow: '0 0 6px rgba(255,214,10,0.55)',
          transition: 'opacity 120ms ease-out',
        }}
      />
      {/*
        Self-ref target handle — stacked below mid-point at 70% so the
        source (`right-top`, mid) and target (`right-bottom`) sit on the
        same right edge with enough vertical separation for γ's
        orthogonal loop to read clearly.
      */}
      <Handle
        id="right-bottom"
        type="target"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
        style={{
          top: '70%',
          opacity: isHovered ? 1 : 0,
          boxShadow: '0 0 6px rgba(255,214,10,0.55)',
          transition: 'opacity 120ms ease-out',
        }}
      />

      {/* D-R5 orphan-entity badge */}
      {data.showOrphanBadge !== false && (
        <OrphanBadge entityId={id} relCount={data.relCount ?? 0} />
      )}

      <EntityHeader
        name={data.name}
        businessName={data.businessName}
        layer={data.layer}
        displayId={data.displayId ?? null}
        hasLintViolation={Boolean(violation)}
      />

      {hasAttrs && (
        <div data-testid="entity-node-attributes" className="border-t border-white/10">
          {primaryAttrs.length > 0 && (
            <ul
              data-testid="entity-node-pk-group"
              data-primary-kind={hideSurrogatePks ? 'bk' : 'pk'}
              className="px-3 py-1.5 space-y-0.5"
            >
              {primaryAttrs.slice(0, MAX_VISIBLE_PER_GROUP).map((a) => (
                <AttributeLine key={a.id} attr={a} isPrimary altKeyLabels={data.altKeyLabels} />
              ))}
              {primaryAttrs.length > MAX_VISIBLE_PER_GROUP && (
                <li className="text-[10px] text-text-secondary italic">
                  +{primaryAttrs.length - MAX_VISIBLE_PER_GROUP} more
                </li>
              )}
            </ul>
          )}
          {primaryAttrs.length > 0 && nonPrimaryAttrs.length > 0 && (
            <div data-testid="entity-node-pk-divider" className="border-t border-white/10" />
          )}
          {nonPrimaryAttrs.length > 0 && (
            <ul data-testid="entity-node-nonpk-group" className="px-3 py-1.5 space-y-0.5">
              {nonPrimaryAttrs.slice(0, MAX_VISIBLE_PER_GROUP).map((a) => (
                <AttributeLine
                  key={a.id}
                  attr={a}
                  isPrimary={false}
                  altKeyLabels={data.altKeyLabels}
                />
              ))}
              {nonPrimaryAttrs.length > MAX_VISIBLE_PER_GROUP && (
                <li className="text-[10px] text-text-secondary italic">
                  +{nonPrimaryAttrs.length - MAX_VISIBLE_PER_GROUP} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AttributeLine({
  attr,
  isPrimary,
  altKeyLabels,
}: {
  attr: EntityNodeAttribute;
  isPrimary: boolean;
  altKeyLabels?: Record<string, string>;
}) {
  const altKey = attr.altKeyGroup ?? null;
  const altLabel = altKey ? (altKeyLabels?.[altKey] ?? null) : null;
  const isPk = attr.isPrimaryKey;
  const isFk = attr.isForeignKey === true;

  return (
    <li
      data-testid="entity-node-attribute"
      data-is-pk={isPk ? 'true' : 'false'}
      data-is-primary={isPrimary ? 'true' : 'false'}
      className="relative flex items-center gap-1.5 text-[11px]"
    >
      {/* Attribute glance view: name + key-role flag(s) only. Types
          live in the attribute properties panel — showing them in the
          diagram is clutter a senior modeller would rather not see
          when scanning the ER graph for PK/FK/BK structure. */}
      <span className="truncate font-mono text-text-primary font-medium">{attr.name}</span>
      <span className="ml-auto shrink-0">
        <AttributeFlagCell isPk={isPk} isFk={isFk} altKeyGroup={altKey} altKeyLabel={altLabel} />
      </span>
      {/* Attribute-level handles retained as hit targets for attr-to-
          attr routing (Step-7 layer_links + future precision drag)
          but rendered fully invisible. Senior-practitioner target:
          Erwin / ER Studio do NOT show per-attribute handles; an amber
          dot on every row reads as beginner tooling. Connections come
          from entity-level handles; FK↔attr inference lives in the
          relationship model, not the canvas chrome. */}
      <Handle
        type="target"
        position={Position.Left}
        id={`attr-${attr.id}-target`}
        className="!h-1.5 !w-1.5 !border-0 !bg-transparent"
        style={{ left: -3, opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={`attr-${attr.id}-source`}
        className="!h-1.5 !w-1.5 !border-0 !bg-transparent"
        style={{ right: -3, opacity: 0 }}
      />
    </li>
  );
}

export const EntityNode = memo(EntityNodeComponent);
