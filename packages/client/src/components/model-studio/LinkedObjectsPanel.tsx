import { useMemo } from 'react';
import { X, ArrowRight, Link as LinkIcon, Plus } from 'lucide-react';
import type { Layer, ProjectionChainResponse } from '@cc/shared';

/**
 * Step 7 S7-C5 / S7-E2 — LinkedObjectsPanel.
 *
 * Right-docked overlay listing every entity in the focused entity's
 * projection graph, grouped by layer (Conceptual / Logical /
 * Physical). Each row carries a "Jump to" button that switches the
 * canvas to that entity's layer and selects it — the same handler
 * the breadcrumb uses, just exposed as a discoverable list instead
 * of a horizontal pill chain.
 *
 * Layout convention matches RelationshipPanel + EntityEditor (the
 * other right-docked panels in the canvas): fixed width, slide in
 * from the right edge, full-height with header / scrollable body /
 * footer. Closes via the header X or by deselecting on the canvas.
 *
 * Empty / singleton state: when the focused entity has no links
 * (chain has just the entity itself), the body shows a friendly
 * empty state nudging the user toward "Link existing entity…" or
 * the auto-project button on the canvas card.
 *
 * Multi-parent / multi-child handling: the breadcrumb only shows
 * the linear primary path (oldest fork at each step). This panel
 * shows the FULL graph — every parent, every child, every sibling.
 * That's what makes it the source of truth for "what's linked to
 * what?" rather than just "what's the canonical chain?".
 */

const LAYER_LABEL: Record<Layer, string> = {
  conceptual: 'Conceptual',
  logical: 'Logical',
  physical: 'Physical',
};

const LAYER_ORDER: Layer[] = ['conceptual', 'logical', 'physical'];

export interface LinkedObjectsPanelProps {
  isOpen: boolean;
  /** The focused entity's projection graph. Null while loading or
   *  when no entity is selected. */
  chain: ProjectionChainResponse | null | undefined;
  onClose(): void;
  /** Switch the canvas to `layer` and select `entityId`. Wired to
   *  the same handler the breadcrumb uses. */
  onJumpTo(entityId: string, layer: Layer): void;
  /** Open the ProjectToModal so the user can link an existing
   *  entity from another layer to the focused entity. */
  onLinkExisting?(): void;
}

export function LinkedObjectsPanel({
  isOpen,
  chain,
  onClose,
  onJumpTo,
  onLinkExisting,
}: LinkedObjectsPanelProps) {
  const groupedByLayer = useMemo(() => {
    const groups: Record<Layer, ProjectionChainResponse['nodes']> = {
      conceptual: [],
      logical: [],
      physical: [],
    };
    if (!chain) return groups;
    for (const node of chain.nodes) {
      groups[node.layer].push(node);
    }
    return groups;
  }, [chain]);

  if (!isOpen) return null;

  const totalLinked = chain?.nodes.length ?? 0;
  const isSingleton = totalLinked <= 1;

  return (
    <aside
      data-testid="linked-objects-panel"
      role="complementary"
      aria-label="Linked objects across layers"
      className={[
        'absolute right-0 top-0 bottom-0 z-30 w-80',
        'flex flex-col',
        'border-l border-white/10 bg-surface-2/95 backdrop-blur-xl',
        'shadow-[-8px_0_24px_rgba(0,0,0,0.35)]',
      ].join(' ')}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <LinkIcon className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary truncate">Linked Objects</h2>
        </div>
        <button
          type="button"
          data-testid="linked-objects-close"
          onClick={onClose}
          aria-label="Close linked objects panel"
          className="rounded p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {isSingleton ? (
          <div
            data-testid="linked-objects-empty"
            className="flex flex-col items-center gap-2 px-4 py-8 text-center"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-surface-1/50 text-text-secondary/60">
              <LinkIcon className="h-4 w-4" />
            </div>
            <p className="text-xs text-text-secondary">No links yet.</p>
            <p className="text-[11px] text-text-secondary/70 leading-relaxed">
              Link this entity to an existing entity on another layer using the button below.
              Greenfield models can also auto-project a new downstream entity from the entity card.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {LAYER_ORDER.map((layer) => {
              const rows = groupedByLayer[layer];
              if (rows.length === 0) return null;
              return (
                <li key={layer}>
                  <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60">
                    {LAYER_LABEL[layer]}
                    <span className="ml-1 text-text-secondary/40">({rows.length})</span>
                  </h3>
                  <ul className="space-y-1">
                    {rows.map((node) => {
                      const isCurrent = node.entityId === chain?.rootId;
                      return (
                        <li key={node.entityId}>
                          <button
                            type="button"
                            data-testid={`linked-object-row-${node.entityId}`}
                            data-current={isCurrent ? 'true' : 'false'}
                            disabled={isCurrent}
                            onClick={() => onJumpTo(node.entityId, node.layer)}
                            className={[
                              'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                              isCurrent
                                ? 'bg-gradient-to-r from-accent/15 to-amber-500/5 border border-accent/30 cursor-default'
                                : 'border border-transparent hover:bg-white/5 hover:border-white/10',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'truncate text-[12px] font-medium',
                                isCurrent ? 'text-accent' : 'text-text-primary',
                              ].join(' ')}
                            >
                              {node.entityName}
                            </span>
                            {isCurrent ? (
                              <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-accent/80">
                                Current
                              </span>
                            ) : (
                              <ArrowRight
                                className="ml-auto h-3 w-3 shrink-0 text-text-secondary/40 group-hover:text-accent"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onLinkExisting && (
        <footer className="border-t border-white/5 p-3">
          <button
            type="button"
            data-testid="linked-objects-link-existing"
            onClick={onLinkExisting}
            className={[
              'inline-flex w-full items-center justify-center gap-1.5',
              'rounded-md border border-accent/30 bg-gradient-to-r from-accent/10 to-amber-500/5',
              'px-3 py-1.5 text-[11px] font-semibold text-accent',
              'hover:from-accent/20 hover:to-amber-500/10 hover:border-accent/50',
            ].join(' ')}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Link existing entity…
          </button>
        </footer>
      )}
    </aside>
  );
}
