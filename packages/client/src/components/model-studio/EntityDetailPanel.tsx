import { useEffect, useRef, useState } from 'react';
import { Sparkles, Trash2, X } from 'lucide-react';
import { lintIdentifier, type Layer, type NamingLintRule } from '@cc/shared';
import type { EntitySummary } from '../../hooks/useEntities';

/**
 * Step 4 — Entity detail panel.
 *
 * Slides in from the right when an entity is selected.
 * Houses: name + businessName + description, Auto-describe button (D5),
 * naming-lint amber underline + suggestion (D6), Delete with cascade
 * confirmation modal.
 *
 * State model:
 *  - The panel keeps a *draft* of the editable fields. Saves are
 *    fired explicitly (Save button or Enter in single-line fields)
 *    so partial typing never round-trips to the server.
 *  - When the parent rotates `entity` (different selection), the
 *    draft resets.
 *
 * Auto-describe UX:
 *  - Click triggers a shimmer on the description field; resolves with
 *    a fade-in animation. Typed errors mapped to friendly messages.
 */

export interface EntityDetailPanelProps {
  entity: EntitySummary | null;
  onClose: () => void;
  onUpdate: (patch: {
    name?: string;
    businessName?: string | null;
    description?: string | null;
  }) => Promise<void>;
  /** Returns the freshly-generated description so the panel can sync
   *  its local draft without waiting for the parent's entity prop to
   *  change (the entity id stays the same). */
  onAutoDescribe: () => Promise<{ description: string }>;
  onDelete: (cascade: boolean) => Promise<void>;
}

function inputClass(violation?: NamingLintRule) {
  return [
    'w-full rounded-md bg-surface-1/70 border px-3 py-2 text-sm text-text-primary',
    'focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent/40',
    'transition-shadow placeholder:text-text-secondary/50',
    violation
      ? 'border-amber-400/60 underline decoration-amber-400 decoration-wavy underline-offset-4'
      : 'border-white/10',
  ].join(' ');
}

export function EntityDetailPanel({
  entity,
  onClose,
  onUpdate,
  onAutoDescribe,
  onDelete,
}: EntityDetailPanelProps) {
  const [draft, setDraft] = useState({ name: '', businessName: '', description: '' });
  const [autoBusy, setAutoBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset the draft whenever the selected entity changes.
  useEffect(() => {
    if (!entity) return;
    setDraft({
      name: entity.name,
      businessName: entity.businessName ?? '',
      description: entity.description ?? '',
    });
    setAutoError(null);
    setConfirmDelete(false);
    // Focus the name input so a freshly created entity is ready to rename.
    queueMicrotask(() => nameRef.current?.focus());
  }, [entity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entity) return null;

  // Live lint preview against the draft so the underline updates as the
  // user types. Server-side lint is the source of truth on save.
  const liveLint = lintIdentifier(draft.name, entity.layer as Layer);
  const violation = liveLint.find((l) => l.severity === 'violation');

  async function commitName() {
    if (!entity) return;
    if (draft.name.trim() === entity.name) return;
    await onUpdate({ name: draft.name.trim() });
  }
  async function commitBusiness() {
    if (!entity) return;
    const next = draft.businessName.trim() || null;
    if (next === (entity.businessName ?? null)) return;
    await onUpdate({ businessName: next });
  }
  async function commitDescription() {
    if (!entity) return;
    const next = draft.description.trim() || null;
    if (next === (entity.description ?? null)) return;
    await onUpdate({ description: next });
  }
  function applySuggestion() {
    if (!violation?.suggestion) return;
    setDraft((d) => ({ ...d, name: violation.suggestion! }));
  }

  async function runAutoDescribe() {
    setAutoBusy(true);
    setAutoError(null);
    try {
      const result = await onAutoDescribe();
      // Sync the local draft so the new text appears immediately. The
      // entity id is unchanged so the entity-id-keyed reset useEffect
      // would not pick this up on its own.
      setDraft((d) => ({ ...d, description: result.description }));
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Auto-describe failed');
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <aside
      data-testid="entity-detail-panel"
      className="absolute right-0 top-0 h-full w-[360px] z-30 transition-transform duration-200 ease-out translate-x-0 border-l border-white/10 bg-surface-2/80 backdrop-blur-xl shadow-[-12px_0_32px_rgba(0,0,0,0.45)]"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-secondary">
            {entity.layer} entity
          </p>
          <h3
            className="mt-0.5 text-sm font-semibold text-text-primary truncate"
            title={entity.name}
          >
            {entity.name}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Close entity panel"
          onClick={onClose}
          className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 px-4 py-4 overflow-y-auto h-[calc(100%-3.25rem)]">
        <div>
          <label
            htmlFor="entity-name"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Name {entity.layer === 'physical' ? '(physical identifier)' : ''}
          </label>
          <input
            id="entity-name"
            ref={nameRef}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            className={inputClass(violation)}
            placeholder="customer"
            autoComplete="off"
          />
          {violation && (
            <div
              data-testid="naming-lint-violation"
              className="mt-1 text-[11px] text-amber-300 flex items-center gap-2"
            >
              <span>{violation.message}</span>
              {violation.suggestion && (
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="rounded-md bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 text-amber-200 hover:bg-amber-400/25"
                >
                  {`Use "${violation.suggestion}"`}
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="entity-business"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Business name
          </label>
          <input
            id="entity-business"
            value={draft.businessName}
            onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
            onBlur={commitBusiness}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            className={inputClass()}
            placeholder="Customer"
            autoComplete="off"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="entity-desc" className="text-xs font-medium text-text-secondary">
              Description
            </label>
            <button
              type="button"
              onClick={runAutoDescribe}
              disabled={autoBusy}
              data-testid="auto-describe-button"
              className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-gradient-to-r from-accent/10 to-amber-500/10 px-2 py-1 text-[11px] font-medium text-accent hover:from-accent/20 hover:to-amber-500/20 disabled:opacity-60"
            >
              <Sparkles className="h-3 w-3" />
              {autoBusy ? 'Describing…' : 'Auto-describe'}
            </button>
          </div>
          <textarea
            id="entity-desc"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            onBlur={commitDescription}
            rows={6}
            className={[
              inputClass(),
              'min-h-[8rem] resize-y',
              autoBusy ? 'animate-pulse bg-surface-1/40' : '',
            ].join(' ')}
            placeholder="What does this entity represent? Click Auto-describe for an AI draft."
          />
          {autoError && (
            <p data-testid="auto-describe-error" className="mt-1 text-[11px] text-red-300">
              {autoError}
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-white/5">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              data-testid="delete-entity-button"
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete entity
            </button>
          ) : (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3">
              <p className="text-xs text-red-100">
                Delete <strong>{entity.name}</strong>? Any attributes, relationships, or layer links
                pointing at it will also be removed.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="delete-entity-confirm"
                  onClick={() => onDelete(true)}
                  className="rounded-md border border-red-400/50 bg-red-500/30 px-2 py-1 text-[11px] text-red-50 hover:bg-red-500/45"
                >
                  Delete + cascade
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
