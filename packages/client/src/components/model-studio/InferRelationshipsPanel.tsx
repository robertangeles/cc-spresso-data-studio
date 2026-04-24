import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import type { CreateRelationshipInput, Layer, Relationship } from '@cc/shared';
import type { InferredProposal, InferResult } from '../../hooks/useRelationships';

/**
 * Step 6 — bottom drawer that kicks off `POST /relationships/infer`
 * and lets the modeller cherry-pick which proposals to accept.
 *
 * Visual pattern borrowed from SyntheticDataDrawer — same bottom-docked
 * glass panel, amber header, shimmer on first-mount to signal "work in
 * progress".
 *
 * Flow:
 *   1. `isOpen` flips → kick `onInfer()` immediately.
 *   2. Sync result → list proposals with per-row Accept/Reject.
 *   3. Async result (`async: true`, `jobId`) → spinner + poll every 2s
 *      (caller supplies `pollJob` which we call on an interval).
 *   4. Confirm → call `onCreate` for each accepted proposal. Partial
 *      success tolerated: failures stay in the panel with an error
 *      flag so the user can retry or skip.
 */

export interface InferRelationshipsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layer: Layer;
  onInfer: () => Promise<InferResult>;
  /** Optional polling hook for async jobs. Supplying it lets the panel
   *  transparently handle the >2000-attr path from 5A. */
  pollJob?: (jobId: string) => Promise<InferResult>;
  onCreate: (input: CreateRelationshipInput) => Promise<Relationship>;
}

type RowState = 'pending' | 'accepting' | 'created' | 'rejected' | 'failed';

interface Row {
  proposal: InferredProposal;
  state: RowState;
  error?: string;
  selected: boolean;
}

function keyOf(p: InferredProposal): string {
  return `${p.sourceEntityId}:${p.targetEntityId}`;
}

export function InferRelationshipsPanel(props: InferRelationshipsPanelProps) {
  const { isOpen, onClose, layer, onInfer, pollJob, onCreate } = props;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyResult = useCallback((res: InferResult) => {
    setWarnings(res.warnings ?? []);
    if (res.async) {
      setJobId(res.jobId ?? null);
      return;
    }
    const next: Row[] = (res.proposals ?? []).map((p) => ({
      proposal: p,
      state: 'pending',
      selected: true,
    }));
    setRows(next);
    setJobId(null);
  }, []);

  // Kick inference on open. Poll if async.
  useEffect(() => {
    if (!isOpen) {
      clearPoll();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);
    setJobId(null);
    setWarnings([]);

    onInfer()
      .then((res) => {
        if (cancelled) return;
        applyResult(res);
        if (res.async && res.jobId && pollJob) {
          pollRef.current = setInterval(async () => {
            try {
              const next = await pollJob(res.jobId as string);
              if (cancelled) return;
              if (!next.async) {
                clearPoll();
                applyResult(next);
                setLoading(false);
              }
            } catch (e: unknown) {
              if (cancelled) return;
              clearPoll();
              setError(e instanceof Error ? e.message : 'Polling failed');
              setLoading(false);
            }
          }, 2000);
        } else {
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Inference failed');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [isOpen, onInfer, pollJob, applyResult, clearPoll]);

  const setAllSelected = (selected: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.state === 'created' ? r : { ...r, selected, state: 'pending' })),
    );
  };

  const toggleOne = (k: string) => {
    setRows((prev) =>
      prev.map((r) => (keyOf(r.proposal) === k ? { ...r, selected: !r.selected } : r)),
    );
  };

  const accepted = useMemo(() => rows.filter((r) => r.selected && r.state !== 'created'), [rows]);

  const submit = useCallback(async () => {
    if (submitting || accepted.length === 0) return;
    setSubmitting(true);
    // Fire creates sequentially to preserve PK-propagation invariants;
    // parallelising risks multiple identifying rels racing on the same
    // target entity's attribute namespace.
    for (const row of accepted) {
      const k = keyOf(row.proposal);
      setRows((prev) =>
        prev.map((r) => (keyOf(r.proposal) === k ? { ...r, state: 'accepting' } : r)),
      );
      try {
        await onCreate({
          sourceEntityId: row.proposal.sourceEntityId,
          targetEntityId: row.proposal.targetEntityId,
          name: null,
          sourceCardinality: row.proposal.sourceCardinality,
          targetCardinality: row.proposal.targetCardinality,
          isIdentifying: false,
          layer,
        });
        setRows((prev) =>
          prev.map((r) =>
            keyOf(r.proposal) === k ? { ...r, state: 'created', selected: false } : r,
          ),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Create failed';
        setRows((prev) =>
          prev.map((r) => (keyOf(r.proposal) === k ? { ...r, state: 'failed', error: msg } : r)),
        );
      }
    }
    setSubmitting(false);
  }, [accepted, layer, onCreate, submitting]);

  if (!isOpen) return null;

  const pendingCount = rows.filter((r) => r.state !== 'created').length;

  return (
    <div
      data-testid="infer-rels-panel"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[65vh] flex-col border-t border-accent/30 bg-surface-2/92 shadow-[0_-16px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <header className="flex items-center gap-2 border-b border-white/10 bg-accent/[0.06] px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Infer relationships</h2>
        <span className="text-[10px] uppercase tracking-wider text-text-secondary/70">
          From FK graph · {layer}
        </span>

        {rows.length > 0 && (
          <div className="ml-4 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAllSelected(true)}
              data-testid="infer-accept-all"
              className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => setAllSelected(false)}
              data-testid="infer-reject-all"
              className="rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
            >
              Reject all
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-[11px] text-text-secondary">
              {pendingCount} proposal{pendingCount === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            data-testid="infer-close"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            {jobId ? `Large model — running async job ${jobId.slice(0, 8)}…` : 'Scanning FK graph…'}
          </div>
        )}

        {!loading && error && (
          <p className="text-red-300" data-testid="infer-error">
            {error}
          </p>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="text-xs italic text-text-secondary/60">
            No proposals — every FK attribute already has a matching relationship.
          </p>
        )}

        {warnings.length > 0 && (
          <ul className="mb-3 space-y-1" data-testid="infer-warnings">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && (
          <ul
            data-testid="infer-proposals-list"
            className="divide-y divide-white/5 rounded-md border border-white/10 bg-surface-1/30"
          >
            {rows.map((r) => {
              const k = keyOf(r.proposal);
              const disabled = r.state === 'created' || r.state === 'accepting' || submitting;
              return (
                <li
                  key={k}
                  data-testid={`infer-proposal-${k}`}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={r.selected}
                    onChange={() => toggleOne(k)}
                    data-testid={`infer-proposal-toggle-${k}`}
                    className="h-3.5 w-3.5 accent-yellow-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="truncate font-semibold text-text-primary">
                        {r.proposal.sourceEntityName}
                      </span>
                      <span className="text-accent">→</span>
                      <span className="truncate font-semibold text-text-primary">
                        {r.proposal.targetEntityName}
                      </span>
                      <span className="rounded-sm border border-white/10 bg-surface-2/60 px-1.5 py-0.5 text-[10px] text-text-secondary">
                        {r.proposal.sourceCardinality}:{r.proposal.targetCardinality}
                      </span>
                      <ConfidenceChip level={r.proposal.confidence} />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                      {r.proposal.reason}
                    </p>
                    {r.state === 'failed' && r.error && (
                      <p className="mt-0.5 text-[11px] text-red-300">{r.error}</p>
                    )}
                  </div>
                  <StatusIcon state={r.state} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-surface-1/40 px-4 py-2.5">
        <span className="mr-auto text-[11px] text-text-secondary">{accepted.length} selected</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-white/10 bg-surface-1/60 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          Close
        </button>
        <button
          type="button"
          data-testid="infer-submit"
          onClick={() => void submit()}
          disabled={submitting || accepted.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-gradient-to-r from-accent/25 to-amber-500/20 px-3 py-1.5 text-xs font-semibold text-accent shadow-[0_0_12px_rgba(255,214,10,0.2)] hover:from-accent/40 hover:to-amber-500/30 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Create {accepted.length > 0 ? accepted.length : ''} relationship
          {accepted.length === 1 ? '' : 's'}
        </button>
      </footer>
    </div>
  );
}

function StatusIcon({ state }: { state: RowState }) {
  if (state === 'accepting') return <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />;
  if (state === 'created') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (state === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return null;
}

function ConfidenceChip({ level }: { level: InferredProposal['confidence'] }) {
  const tone =
    level === 'high'
      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
      : level === 'medium'
        ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
        : 'border-white/15 bg-surface-1/60 text-text-secondary';
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {level}
    </span>
  );
}
