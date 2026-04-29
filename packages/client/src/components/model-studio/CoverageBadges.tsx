import type { Layer, LayerCoverageCell } from '@cc/shared';

/**
 * Step 7 — CoverageBadges (S7-E4).
 *
 * Compact 3-pill row on each EntityNode card showing which layers
 * the entity has projections on:
 *
 *   [C] [L] [P]
 *
 * Bright = projection exists on that layer (boolean cell true).
 * Dim    = no projection on that layer.
 *
 * The entity's own layer is always bright (the coverage matrix sets
 * the own-layer cell to true when the entity exists there). The two
 * other layer pills tell the modeller, at a glance, whether the
 * entity is linked across the stack.
 *
 * No interactivity here — clicking an entity opens the
 * LinkedObjectsPanel for cross-layer navigation. Keeping the badges
 * read-only avoids ambiguous "what does clicking C do?" semantics.
 */

export interface CoverageBadgesProps {
  /** The cell from `LayerCoverageResponse.coverage[entityId]`. When
   *  undefined (coverage matrix still loading or entity not yet in
   *  the matrix), every pill renders dim. */
  cell: LayerCoverageCell | undefined;
  /** Highlight the entity's own layer with a stronger accent so the
   *  reader can tell which row the card lives on. */
  ownLayer: Layer;
}

const LAYER_ORDER: Array<{ layer: Layer; letter: string; full: string }> = [
  { layer: 'conceptual', letter: 'C', full: 'Conceptual' },
  { layer: 'logical', letter: 'L', full: 'Logical' },
  { layer: 'physical', letter: 'P', full: 'Physical' },
];

export function CoverageBadges({ cell, ownLayer }: CoverageBadgesProps) {
  return (
    <div
      data-testid="entity-coverage-badges"
      role="list"
      aria-label="Layer coverage"
      className="flex items-center gap-1 px-3 py-1"
    >
      {LAYER_ORDER.map(({ layer, letter, full }) => {
        const present = cell?.[layer] ?? false;
        const isOwn = layer === ownLayer;
        const ariaLabel = present
          ? `${full}: projected${isOwn ? ' (current layer)' : ''}`
          : `${full}: not projected`;
        return (
          <span
            key={layer}
            role="listitem"
            data-testid={`coverage-badge-${layer}`}
            data-present={present ? 'true' : 'false'}
            data-own={isOwn ? 'true' : 'false'}
            aria-label={ariaLabel}
            title={ariaLabel}
            className={[
              'inline-flex h-4 w-4 items-center justify-center rounded',
              'font-mono text-[9px] font-semibold leading-none',
              'border',
              present
                ? isOwn
                  ? 'border-accent/60 bg-accent/20 text-accent shadow-[0_0_6px_rgba(255,214,10,0.25)]'
                  : 'border-accent/30 bg-accent/10 text-accent/90'
                : 'border-white/5 bg-surface-1/40 text-text-secondary/30',
            ].join(' ')}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}
