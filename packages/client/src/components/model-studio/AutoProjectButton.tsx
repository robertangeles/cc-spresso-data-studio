import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { Layer, LayerCoverageCell } from '@cc/shared';
import { autoProjectTargetFor, isUnlinked, type OriginDirection } from './layer-direction';

/**
 * Step 7 EXP-1 — AutoProjectButton.
 *
 * One-click scaffold of an entity's projection on the next layer
 * (per model.originDirection). Renders only when the entity is
 * "unlinked" toward its expected next layer — i.e. the modeller
 * hasn't yet projected it. Once projected, the coverage cell flips
 * true and the button hides itself.
 *
 * Compact label format: `→ L` (single letter for the target layer).
 * Click triggers an async mutation; the button shows a spinner until
 * the project request resolves. Errors surface via the useProjection
 * hook's toast — the button is fire-and-forget here.
 *
 * Conceptual nuance: per DMBOK, conceptual entities have no
 * attributes by convention. The server's projection scaffolds a
 * downstream entity with the same name + business-key attrs only;
 * detailed attributes are added manually after the projection lands.
 */

const LETTER: Record<Layer, string> = {
  conceptual: 'C',
  logical: 'L',
  physical: 'P',
};

const FULL: Record<Layer, string> = {
  conceptual: 'Conceptual',
  logical: 'Logical',
  physical: 'Physical',
};

export interface AutoProjectButtonProps {
  entityId: string;
  ownLayer: Layer;
  origin: OriginDirection;
  cell: LayerCoverageCell | undefined;
  onProject(entityId: string, toLayer: Layer): Promise<void>;
}

export function AutoProjectButton({
  entityId,
  ownLayer,
  origin,
  cell,
  onProject,
}: AutoProjectButtonProps) {
  const [busy, setBusy] = useState(false);

  // Two gates: (a) the entity must be unlinked toward its expected
  // next layer, and (b) auto-project must be SERVER-SUPPORTED for
  // this origin/layer pair. Existing-system models fall through (b)
  // because the scaffold service only supports greenfield directions
  // — those users link manually via the Linked-Objects panel.
  if (!isUnlinked(origin, ownLayer, cell)) return null;
  const target = autoProjectTargetFor(origin, ownLayer);
  if (!target) return null;

  const handleClick = async (e: React.MouseEvent) => {
    // Stop propagation so the canvas doesn't also receive the click
    // and select the entity (the entity is already "selected enough"
    // for the user to have clicked the button on its card).
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onProject(entityId, target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="auto-project-button"
      data-target-layer={target}
      onClick={handleClick}
      disabled={busy}
      title={`Project this entity to ${FULL[target]}`}
      aria-label={`Project ${entityId} to ${FULL[target]}`}
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wider',
        'border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10',
        'text-accent hover:from-accent/25 hover:to-amber-500/20',
        'shadow-[0_0_8px_rgba(255,214,10,0.2)]',
        'disabled:opacity-60 disabled:cursor-progress',
      ].join(' ')}
    >
      {busy ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
      )}
      <span>{LETTER[target]}</span>
    </button>
  );
}
