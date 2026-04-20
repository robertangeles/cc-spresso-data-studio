import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { EntitySummary } from '../../hooks/useEntities';
import type { EntityRelationshipImpact } from '../../hooks/useRelationships';
import type { Relationship } from '@cc/shared';

/**
 * Step 6 — cascade-delete preview for an entity with relationships.
 *
 * Flow:
 *   1. Caller opens this with `entityId`.
 *   2. We call `getEntityImpact(entityId)` which returns a list of
 *      relationship ids the server will have to delete. We cross-
 *      reference them against the local `relationships` array to get
 *      source/target names for each line — the server endpoint is
 *      intentionally id-only (cheap) and we compose the display-side.
 *   3. On Confirm we re-query impact. If the count changed since the
 *      dialog opened, we flash a delta message and require a second
 *      click before firing the cascade delete. This addresses
 *      S6-U23's race window where a peer tab mutates mid-review.
 *
 * Rendered via `createPortal(document.body)` per L24 so absolute /
 * z-indexed ancestors can't clip the modal.
 */

export interface CascadeDeleteDialogProps {
  isOpen: boolean;
  entityId: string | null;
  entityName: string | null;
  /** Async impact loader — defer to the caller so we reuse the hook's
   *  error handling + auth. */
  getEntityImpact: (entityId: string) => Promise<EntityRelationshipImpact>;
  relationships: Relationship[];
  entities: EntitySummary[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

interface ImpactView {
  count: number;
  rows: Array<{ id: string; label: string; cardinality: string }>;
}

function buildView(
  impact: EntityRelationshipImpact,
  relationships: Relationship[],
  entities: EntitySummary[],
): ImpactView {
  const entityById = new Map(entities.map((e) => [e.id, e.name]));
  const relById = new Map(relationships.map((r) => [r.id, r]));
  const rows = impact.relationshipIds.map((id) => {
    const rel = relById.get(id);
    if (!rel) {
      return { id, label: `relationship ${id}`, cardinality: '?' };
    }
    const src = entityById.get(rel.sourceEntityId) ?? rel.sourceEntityId;
    const tgt = entityById.get(rel.targetEntityId) ?? rel.targetEntityId;
    return {
      id,
      label: `${src} → ${tgt}`,
      cardinality: `${rel.sourceCardinality}:${rel.targetCardinality}`,
    };
  });
  return { count: impact.count, rows };
}

export function CascadeDeleteDialog(props: CascadeDeleteDialogProps) {
  const { isOpen } = props;

  if (!isOpen || !props.entityId) return null;
  return createPortal(<DialogBody {...props} />, document.body);
}

function DialogBody({
  entityId,
  entityName,
  getEntityImpact,
  relationships,
  entities,
  onConfirm,
  onClose,
}: CascadeDeleteDialogProps) {
  const [view, setView] = useState<ImpactView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);

  // Snapshot the count at open so we can detect delta on confirm.
  const openCountRef = useRef<number | null>(null);

  const loadImpact = async () => {
    if (!entityId) return null;
    const impact = await getEntityImpact(entityId);
    return buildView(impact, relationships, entities);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setView(null);
    setDelta(null);
    openCountRef.current = null;
    loadImpact()
      .then((v) => {
        if (cancelled || !v) return;
        setView(v);
        openCountRef.current = v.count;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load delete preview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // ESC closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleConfirm = async () => {
    if (isSubmitting || !entityId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Re-query impact to catch any peer-tab inserts / deletes that
      // happened while the dialog sat open. If the count changed, we
      // show a delta and require a second click before destroying.
      const fresh = await loadImpact();
      if (fresh && openCountRef.current !== null && fresh.count !== openCountRef.current) {
        setDelta(fresh.count - openCountRef.current);
        setView(fresh);
        openCountRef.current = fresh.count;
        return;
      }
      await onConfirm();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cascade delete failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Delete entity with relationships"
      data-testid="cascade-delete-dialog"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-red-400/25 bg-surface-2/95 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <header className="flex items-center gap-2 border-b border-white/10 bg-red-500/10 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-red-300" />
          <h2 className="text-sm font-semibold text-red-100">
            Cascade delete{entityName ? ` · ${entityName}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-red-200/70 hover:bg-white/5 hover:text-red-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="px-5 py-4 text-sm text-text-primary">
          {loading && (
            <div className="flex items-center gap-2 text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Counting impacted relationships…
            </div>
          )}

          {!loading && error && (
            <p className="text-red-300" data-testid="cascade-delete-error">
              {error}
            </p>
          )}

          {!loading && !error && view && (
            <>
              <p className="text-text-secondary">
                Deleting this entity will also remove{' '}
                <span className="font-semibold text-accent" data-testid="cascade-delete-count">
                  {view.count} relationship{view.count === 1 ? '' : 's'}
                </span>
                .
              </p>

              {delta !== null && (
                <p
                  data-testid="cascade-delete-delta"
                  className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200"
                >
                  {delta > 0
                    ? `${delta} more rels since you opened this dialog — review?`
                    : `${-delta} fewer rels since you opened this dialog — review?`}
                </p>
              )}

              {view.rows.length > 0 && (
                <ul
                  data-testid="cascade-delete-list"
                  className="mt-3 max-h-64 space-y-1 overflow-auto rounded-md border border-white/10 bg-surface-1/40 p-2"
                >
                  {view.rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-xs"
                    >
                      <span className="truncate text-text-primary">{r.label}</span>
                      <span className="ml-auto rounded-sm border border-white/10 bg-surface-2/60 px-1.5 py-0.5 text-[10px] text-text-secondary">
                        {r.cardinality}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-surface-1/40 px-5 py-3">
          <button
            type="button"
            data-testid="cascade-delete-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-white/10 bg-surface-1/60 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="cascade-delete-confirm"
            onClick={() => void handleConfirm()}
            disabled={loading || isSubmitting || Boolean(error)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/50 bg-gradient-to-r from-red-500/30 to-red-600/30 px-3 py-1.5 text-xs font-semibold text-red-50 shadow-[0_0_14px_rgba(239,68,68,0.25)] hover:from-red-500/45 hover:to-red-600/45 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Delete
          </button>
        </footer>
      </div>
    </div>
  );
}
