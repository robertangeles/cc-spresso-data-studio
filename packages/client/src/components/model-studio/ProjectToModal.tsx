import { useEffect, useMemo, useState } from 'react';
import { X, Link as LinkIcon, Loader2 } from 'lucide-react';
import type { Layer, LayerLink } from '@cc/shared';
import { useEntities } from '../../hooks/useEntities';
import { useLayerLinks } from '../../hooks/useLayerLinks';

/**
 * Step 7 S7-E2.5 — ProjectToModal.
 *
 * "Link existing entity…" flow. Opens from the LinkedObjectsPanel
 * footer when the user wants to associate the focused entity with
 * another entity that already exists on a different layer (e.g.
 * an inherited physical table the user wants to back-fill from a
 * conceptual entity they've just authored).
 *
 * Convention for `(parentId, childId)`:
 *   - The focused entity is the **parent** (source of the link).
 *   - The picked target entity is the **child**.
 *   - The opposite direction can be created by switching to the
 *     other entity first and re-opening the modal.
 *
 * The server enforces the cross-layer + acyclic invariants. A 400
 * surfaces "same layer" or "creates cycle" via the toast inside
 * `useLayerLinks.create`. A 409 surfaces "Already linked" — caller
 * sees the existing link in the LinkedObjectsPanel.
 */

const LAYER_LABEL: Record<Layer, string> = {
  conceptual: 'Conceptual',
  logical: 'Logical',
  physical: 'Physical',
};

const ALL_LAYERS: Layer[] = ['conceptual', 'logical', 'physical'];

export interface ProjectToModalProps {
  isOpen: boolean;
  modelId: string;
  /** The focused entity that becomes the link's parent. */
  sourceEntityId: string;
  sourceEntityLayer: Layer;
  sourceEntityName: string;
  onClose(): void;
  /** Fired after a successful create so the parent can refresh
   *  coverage + projection chain caches. */
  onLinked?(link: LayerLink): void;
}

export function ProjectToModal({
  isOpen,
  modelId,
  sourceEntityId,
  sourceEntityLayer,
  sourceEntityName,
  onClose,
  onLinked,
}: ProjectToModalProps) {
  const ent = useEntities(modelId);
  const links = useLayerLinks(modelId);

  // Pre-pick a sensible default layer — the first OTHER layer.
  const defaultTargetLayer = useMemo<Layer>(
    () => ALL_LAYERS.find((l) => l !== sourceEntityLayer) ?? 'logical',
    [sourceEntityLayer],
  );
  const [targetLayer, setTargetLayer] = useState<Layer>(defaultTargetLayer);
  const [targetEntityId, setTargetEntityId] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form whenever the modal opens fresh on a new source.
  useEffect(() => {
    if (!isOpen) return;
    setTargetLayer(defaultTargetLayer);
    setTargetEntityId('');
    setSubmitError(null);
  }, [isOpen, sourceEntityId, defaultTargetLayer]);

  const candidates = useMemo(
    () =>
      ent.entities
        .filter((e) => e.layer === targetLayer && e.id !== sourceEntityId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ent.entities, targetLayer, sourceEntityId],
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEntityId) {
      setSubmitError('Pick a target entity first.');
      return;
    }
    setSubmitError(null);
    try {
      const link = await links.create(sourceEntityId, targetEntityId);
      onLinked?.(link);
      onClose();
    } catch (err) {
      // useLayerLinks already toasted; capture the message inline so
      // the modal stays open and the user can adjust the form.
      setSubmitError(err instanceof Error ? err.message : 'Failed to create link');
    }
  };

  return (
    <div
      data-testid="project-to-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Link to existing entity"
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={[
          'relative w-[420px] max-w-[90vw] rounded-xl border border-white/10',
          'bg-surface-2/95 backdrop-blur-xl shadow-[0_24px_48px_rgba(0,0,0,0.5)]',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Link existing entity</h2>
          </div>
          <button
            type="button"
            data-testid="project-to-close"
            aria-label="Close link modal"
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Link <span className="text-text-primary font-medium">{sourceEntityName}</span> (
            {LAYER_LABEL[sourceEntityLayer]}) to an entity on another layer.
          </p>

          <div className="space-y-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
              Target layer
            </label>
            <select
              data-testid="project-to-layer"
              value={targetLayer}
              onChange={(e) => {
                setTargetLayer(e.target.value as Layer);
                setTargetEntityId('');
              }}
              className="w-full rounded-md border border-white/10 bg-surface-1/60 px-2 py-1.5 text-[12px] text-text-primary focus:border-accent/40 focus:outline-none"
            >
              {ALL_LAYERS.filter((l) => l !== sourceEntityLayer).map((l) => (
                <option key={l} value={l}>
                  {LAYER_LABEL[l]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
              Target entity ({candidates.length})
            </label>
            <select
              data-testid="project-to-entity"
              value={targetEntityId}
              onChange={(e) => setTargetEntityId(e.target.value)}
              disabled={candidates.length === 0}
              className="w-full rounded-md border border-white/10 bg-surface-1/60 px-2 py-1.5 text-[12px] text-text-primary focus:border-accent/40 focus:outline-none disabled:opacity-50"
            >
              <option value="">— Pick an entity —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <p className="text-[10px] text-text-secondary/70">
                No entities on {LAYER_LABEL[targetLayer]} yet. Create one first or use the
                auto-project button on the entity card.
              </p>
            )}
          </div>

          {submitError && (
            <p
              data-testid="project-to-error"
              role="alert"
              className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1"
            >
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="project-to-submit"
              disabled={links.isMutating || !targetEntityId}
              className={[
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
                'border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10',
                'text-[11px] font-semibold text-accent',
                'hover:from-accent/25 hover:to-amber-500/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {links.isMutating ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <LinkIcon className="h-3 w-3" aria-hidden="true" />
              )}
              Create link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
