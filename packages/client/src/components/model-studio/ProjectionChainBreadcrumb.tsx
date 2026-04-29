import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Layer, ProjectionChainNode, ProjectionChainResponse } from '@cc/shared';

/**
 * Step 7 EXP-2 — projection chain breadcrumb.
 *
 * Rendered in the detail-page header when the user focuses a linked
 * entity. Shows the ancestors (walking parentIds) and descendants
 * (walking childIds) as a horizontal chain; the current entity is
 * highlighted with an amber accent.
 *
 * Multi-parent / multi-child DAGs (per ARCH-2): pick the FIRST entry
 * at each fork (server sorts by createdAt asc, so first = oldest =
 * the primary / canonical path). A chevron next to the segment
 * indicates alternates exist; full alternate-picker UX lives in the
 * LinkedObjectsPanel (Lane 5), not here.
 *
 * Returns `null` when:
 *   - chain is missing / loading
 *   - chain has only the root (entity isn't linked to anything)
 *
 * A singleton chain isn't a "projection" worth showing in a header
 * spot; the canvas already displays the entity name on the card.
 */

export interface ProjectionChainBreadcrumbProps {
  chain: ProjectionChainResponse | null | undefined;
  /** Called when a non-current segment is clicked. Caller navigates
   *  (switches layer + selects the target entity on the canvas). */
  onSegmentClick?(entityId: string, layer: Layer): void;
}

const LAYER_LABEL: Record<Layer, string> = {
  conceptual: 'CONCEPTUAL',
  logical: 'LOGICAL',
  physical: 'PHYSICAL',
};

interface ResolvedPath {
  segments: ProjectionChainNode[];
  /** True when any node in the path has more than one parent or child
   *  that wasn't included in the picked linear path — hints that
   *  alternates exist. */
  hasAlternates: boolean;
}

/** Walk the adjacency list from rootId upward via parentIds[0] and
 *  downward via childIds[0]. Guarded against cycles by a visited set.
 *  Returns the linear segment path plus a flag for "alternates exist
 *  along this walk" so the UI can render the chevron hint.
 */
function resolveLinearPath(chain: ProjectionChainResponse): ResolvedPath {
  const byId = new Map(chain.nodes.map((n) => [n.entityId, n]));
  const rootNode = byId.get(chain.rootId);
  if (!rootNode) return { segments: [], hasAlternates: false };

  const visited = new Set<string>([chain.rootId]);
  let hasAlternates = false;

  // Walk up (ancestors). We unshift so the result is top→root order.
  const ancestors: ProjectionChainNode[] = [];
  let cursor: ProjectionChainNode | undefined = rootNode;
  while (cursor && cursor.parentIds.length > 0) {
    if (cursor.parentIds.length > 1) hasAlternates = true;
    const nextId = cursor.parentIds[0]!;
    if (visited.has(nextId)) break;
    visited.add(nextId);
    const next = byId.get(nextId);
    if (!next) break;
    ancestors.unshift(next);
    cursor = next;
  }

  // Walk down (descendants). Push in order root→leaf.
  const descendants: ProjectionChainNode[] = [];
  cursor = rootNode;
  while (cursor && cursor.childIds.length > 0) {
    if (cursor.childIds.length > 1) hasAlternates = true;
    const nextId = cursor.childIds[0]!;
    if (visited.has(nextId)) break;
    visited.add(nextId);
    const next = byId.get(nextId);
    if (!next) break;
    descendants.push(next);
    cursor = next;
  }

  return {
    segments: [...ancestors, rootNode, ...descendants],
    hasAlternates,
  };
}

export function ProjectionChainBreadcrumb({
  chain,
  onSegmentClick,
}: ProjectionChainBreadcrumbProps) {
  const { segments, hasAlternates } = useMemo<ResolvedPath>(() => {
    if (!chain) return { segments: [], hasAlternates: false };
    return resolveLinearPath(chain);
  }, [chain]);

  // Nothing to render: chain missing, or the entity has no links
  // (segments.length === 1 is just the entity by itself).
  if (!chain || segments.length <= 1) return null;

  return (
    <nav
      data-testid="projection-chain-breadcrumb"
      aria-label="Projection chain"
      className={[
        'inline-flex items-center gap-1 rounded-md px-2 py-1',
        'bg-surface-2/60 border border-white/5 backdrop-blur',
      ].join(' ')}
    >
      <ol className="flex items-center gap-1">
        {segments.map((node, i) => {
          const isCurrent = node.entityId === chain.rootId;
          const isLast = i === segments.length - 1;
          return (
            <li key={node.entityId} className="inline-flex items-center gap-1">
              {renderSegment({
                node,
                isCurrent,
                onClick: onSegmentClick,
              })}
              {!isLast && (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3 w-3 text-text-secondary/40 shrink-0"
                />
              )}
            </li>
          );
        })}
      </ol>
      {hasAlternates && (
        <span
          data-testid="projection-chain-alternates-hint"
          title="This chain has alternate parents or children. Open the linked-objects panel to see them all."
          aria-label="Alternate projections available"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-surface-1/60 text-[9px] text-text-secondary/80"
        >
          &hellip;
        </span>
      )}
    </nav>
  );
}

function renderSegment(args: {
  node: ProjectionChainNode;
  isCurrent: boolean;
  onClick?: (entityId: string, layer: Layer) => void;
}) {
  const { node, isCurrent, onClick } = args;
  const labelRow = (
    <>
      <span className="text-[9px] uppercase tracking-wider text-text-secondary/60">
        {LAYER_LABEL[node.layer]}
      </span>
      <span className="text-[12px] font-medium">{node.entityName}</span>
    </>
  );

  if (isCurrent) {
    return (
      <span
        data-testid={`chain-segment-${node.entityId}`}
        aria-current="location"
        className={[
          'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5',
          'bg-gradient-to-r from-accent/20 to-amber-500/10 text-accent',
          'shadow-[0_0_10px_rgba(255,214,10,0.15)]',
        ].join(' ')}
      >
        {labelRow}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid={`chain-segment-${node.entityId}`}
      onClick={() => onClick?.(node.entityId, node.layer)}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5',
        'text-text-secondary hover:text-text-primary hover:bg-white/5',
        'focus:outline-none focus:ring-2 focus:ring-accent/40',
      ].join(' ')}
    >
      {labelRow}
    </button>
  );
}
