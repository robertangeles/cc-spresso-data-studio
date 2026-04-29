import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import type { Layer, LayerLinkSuggestion } from '@cc/shared';

/**
 * Step 7 EXP-3 — LayerLinkSuggestionsPanel.
 *
 * Bottom-docked drawer that surfaces server-suggested cross-layer
 * entity pairs (case-insensitive exact name match, already excluding
 * pairs that are linked) and lets the user accept them in a single
 * click each, or in bulk via "Accept all".
 *
 * Visual + state-flow anchor: `InferRelationshipsPanel` (Step 6).
 * Differences from that one: this panel is CROSS-LAYER (from/to
 * pickers in the header), and accept is direct per-row (no
 * checkbox + submit batching) because each suggestion is independent
 * and the server-side cycle guard makes per-row creates safe.
 *
 * Direction convention matches `ProjectToModal`: the "from" entity
 * becomes the link's parent, the "to" entity becomes the child.
 *
 * Empty / error / loading states use the same Infection-Virus glass-
 * morph treatment as the InferRelationshipsPanel so users recognise
 * the affordance at a glance.
 */

const LAYER_LABEL: Record<Layer, string> = {
  conceptual: 'Conceptual',
  logical: 'Logical',
  physical: 'Physical',
};

const ALL_LAYERS: Layer[] = ['conceptual', 'logical', 'physical'];

type RowState = 'idle' | 'accepting' | 'accepted' | 'rejected' | 'failed';

interface Row {
  suggestion: LayerLinkSuggestion;
  state: RowState;
  error?: string;
}

function keyOf(s: LayerLinkSuggestion): string {
  return `${s.fromEntityId}::${s.toEntityId}`;
}

export interface LayerLinkSuggestionsPanelProps {
  isOpen: boolean;
  onClose(): void;
  /** Default "from" layer when the panel opens — typically the
   *  current canvas layer so users see suggestions that fit the
   *  view they were just looking at. */
  defaultFrom: Layer;
  /** Default "to" layer — typically the first OTHER layer so the
   *  panel scans something useful on first open. */
  defaultTo: Layer;
  /** Server-returned suggestions. Owned by the parent (the detail
   *  page already has a `useLayerCoverage` instance for the matrix). */
  suggestions: LayerLinkSuggestion[];
  isLoading: boolean;
  /** Trigger a fresh fetch with the picked from/to. */
  loadSuggestions(fromLayer: Layer, toLayer: Layer): Promise<unknown>;
  /** Drop the parent's cached list — called when the panel closes
   *  so a stale list isn't surfaced when the user reopens against
   *  a different layer pair. */
  clearSuggestions(): void;
  /** Create the layer_link. Returns the created link or rejects on
   *  server error. The panel translates the result into the row
   *  state machine. */
  onAccept(parentId: string, childId: string): Promise<unknown>;
  /** Fired after AT LEAST ONE accept lands so the parent can refresh
   *  the coverage matrix + invalidate the projection-chain cache. */
  onAccepted(): void;
}

export function LayerLinkSuggestionsPanel({
  isOpen,
  onClose,
  defaultFrom,
  defaultTo,
  suggestions,
  isLoading,
  loadSuggestions,
  clearSuggestions,
  onAccept,
  onAccepted,
}: LayerLinkSuggestionsPanelProps) {
  const [fromLayer, setFromLayer] = useState<Layer>(defaultFrom);
  const [toLayer, setToLayer] = useState<Layer>(defaultTo);
  // Per-row UI state — keyed by `${from}::${to}`. Decoupled from the
  // server `suggestions` array so accept/reject animations can flow
  // independently of refetch.
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});
  const acceptedAnyRef = useRef(false);

  // Re-fetch on open + on layer-picker change. Clearing on close
  // (in `handleClose` below) ensures stale lists never linger across
  // open/close cycles with different from/to picks.
  useEffect(() => {
    if (!isOpen) return;
    void loadSuggestions(fromLayer, toLayer);
  }, [isOpen, fromLayer, toLayer, loadSuggestions]);

  // Reset row UI state whenever the suggestions array changes (new
  // fetch landed). Accepted/rejected rows from a previous list don't
  // carry over — the new list is the source of truth.
  useEffect(() => {
    setRowState({});
    setRowError({});
  }, [suggestions]);

  const rows: Row[] = useMemo(
    () =>
      suggestions.map((s) => {
        const k = keyOf(s);
        return {
          suggestion: s,
          state: rowState[k] ?? 'idle',
          error: rowError[k],
        };
      }),
    [suggestions, rowState, rowError],
  );

  const visibleRows = useMemo(() => rows.filter((r) => r.state !== 'rejected'), [rows]);

  const acceptableCount = useMemo(
    () => visibleRows.filter((r) => r.state === 'idle' || r.state === 'failed').length,
    [visibleRows],
  );

  const handleAcceptOne = useCallback(
    async (s: LayerLinkSuggestion) => {
      const k = keyOf(s);
      setRowState((prev) => ({ ...prev, [k]: 'accepting' }));
      setRowError((prev) => ({ ...prev, [k]: undefined }));
      try {
        await onAccept(s.fromEntityId, s.toEntityId);
        setRowState((prev) => ({ ...prev, [k]: 'accepted' }));
        if (!acceptedAnyRef.current) {
          acceptedAnyRef.current = true;
        }
        onAccepted();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Accept failed';
        setRowState((prev) => ({ ...prev, [k]: 'failed' }));
        setRowError((prev) => ({ ...prev, [k]: msg }));
      }
    },
    [onAccept, onAccepted],
  );

  const handleReject = useCallback((s: LayerLinkSuggestion) => {
    const k = keyOf(s);
    setRowState((prev) => ({ ...prev, [k]: 'rejected' }));
  }, []);

  const handleAcceptAll = useCallback(async () => {
    // Sequential creates — server-side cycle detection runs in a
    // SERIALIZABLE tx and races between two concurrent links from
    // the same suggestion list could collide on retry. Sequential
    // is slower but preserves the "every row reports its own state"
    // UX without weird interleaving.
    for (const r of rows) {
      if (r.state !== 'idle' && r.state !== 'failed') continue;
      await handleAcceptOne(r.suggestion);
    }
  }, [rows, handleAcceptOne]);

  const handleClose = useCallback(() => {
    clearSuggestions();
    setRowState({});
    setRowError({});
    acceptedAnyRef.current = false;
    onClose();
  }, [clearSuggestions, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="layer-link-suggestions-panel"
      role="dialog"
      aria-label="Layer-link suggestions"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[65vh] flex-col border-t border-accent/30 bg-surface-2/92 shadow-[0_-16px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-accent/[0.06] px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">Layer-link suggestions</h2>

        <div className="ml-2 flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-secondary/70">
            From
          </label>
          <select
            data-testid="suggestions-from"
            value={fromLayer}
            onChange={(e) => setFromLayer(e.target.value as Layer)}
            className="rounded-md border border-white/10 bg-surface-1/60 px-1.5 py-0.5 text-[11px] text-text-primary focus:border-accent/40 focus:outline-none"
          >
            {ALL_LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
          <span className="text-text-secondary/50">→</span>
          <label className="text-[10px] uppercase tracking-wider text-text-secondary/70">To</label>
          <select
            data-testid="suggestions-to"
            value={toLayer}
            onChange={(e) => setToLayer(e.target.value as Layer)}
            className="rounded-md border border-white/10 bg-surface-1/60 px-1.5 py-0.5 text-[11px] text-text-primary focus:border-accent/40 focus:outline-none"
          >
            {ALL_LAYERS.filter((l) => l !== fromLayer).map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
        </div>

        {acceptableCount > 0 && (
          <button
            type="button"
            data-testid="suggestions-accept-all"
            onClick={() => void handleAcceptAll()}
            className="ml-3 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
          >
            Accept all ({acceptableCount})
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="suggestions-close"
            onClick={handleClose}
            aria-label="Close suggestions panel"
            className="rounded-md p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading && (
          <div
            data-testid="suggestions-loading"
            className="flex items-center gap-2 text-xs text-text-secondary"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            Scanning {LAYER_LABEL[fromLayer]} → {LAYER_LABEL[toLayer]} for name matches…
          </div>
        )}

        {!isLoading && visibleRows.length === 0 && (
          <p data-testid="suggestions-empty" className="text-xs italic text-text-secondary/60">
            No name-matched candidates between {LAYER_LABEL[fromLayer]} and {LAYER_LABEL[toLayer]}.
            Names are matched case-insensitively; rename entities on either side to surface more
            pairs, or use the Linked panel to link manually.
          </p>
        )}

        {!isLoading && visibleRows.length > 0 && (
          <ul
            data-testid="suggestions-list"
            className="divide-y divide-white/5 rounded-md border border-white/10 bg-surface-1/30"
          >
            {visibleRows.map((r) => {
              const k = keyOf(r.suggestion);
              const isBusy = r.state === 'accepting';
              const isDone = r.state === 'accepted';
              return (
                <li
                  key={k}
                  data-testid={`suggestion-row-${k}`}
                  data-state={r.state}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="truncate font-semibold text-text-primary">
                        {r.suggestion.fromEntityName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-text-secondary/50">
                        {LAYER_LABEL[fromLayer]}
                      </span>
                      <span className="text-accent">→</span>
                      <span className="truncate font-semibold text-text-primary">
                        {r.suggestion.toEntityName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-text-secondary/50">
                        {LAYER_LABEL[toLayer]}
                      </span>
                      <ConfidenceChip level={r.suggestion.confidence} />
                    </div>
                    {r.state === 'failed' && r.error && (
                      <p
                        data-testid={`suggestion-row-error-${k}`}
                        className="mt-0.5 text-[11px] text-red-300"
                      >
                        {r.error}
                      </p>
                    )}
                  </div>

                  {isDone ? (
                    <span
                      data-testid={`suggestion-row-done-${k}`}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-300"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Linked
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`suggestion-row-accept-${k}`}
                        disabled={isBusy}
                        onClick={() => void handleAcceptOne(r.suggestion)}
                        className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-accent shadow-[0_0_8px_rgba(255,214,10,0.18)] hover:from-accent/25 hover:to-amber-500/20 disabled:cursor-progress disabled:opacity-60"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        )}
                        Accept
                      </button>
                      <button
                        type="button"
                        data-testid={`suggestion-row-reject-${k}`}
                        disabled={isBusy}
                        onClick={() => handleReject(r.suggestion)}
                        aria-label={`Reject ${r.suggestion.fromEntityName} → ${r.suggestion.toEntityName}`}
                        className="rounded-md p-1 text-text-secondary hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConfidenceChip({ level }: { level: LayerLinkSuggestion['confidence'] }) {
  // Server only emits 'high' today but the schema is an enum so future
  // 'medium' / 'low' phases drop in here without breaking the panel.
  return (
    <span
      data-testid="suggestion-confidence-chip"
      className="rounded-sm border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200"
    >
      {level}
    </span>
  );
}
