import { useState } from 'react';
import { Clipboard, ClipboardCheck, RefreshCw, X, AlertTriangle, Sparkles } from 'lucide-react';
import type { SyntheticDataResult } from '../../hooks/useAttributes';
import { escapeClipboardCell, rowToTsv } from '../../lib/csvSafe';

/**
 * Step 5 — Synthetic Data Drawer (delight D9).
 *
 * Bottom-docked slide-up drawer that displays LLM-generated sample
 * rows for the currently-selected entity. The drawer insets on the
 * right when the EntityDetailPanel is open so the two don't fight
 * for the same space on wide screens.
 *
 * Safety:
 *   - A bright amber "SYNTHETIC — NOT REAL" badge is always visible.
 *   - Every displayed cell and the clipboard copy go through
 *     escapeClipboardCell() so formula-injection strings like `=cmd`
 *     are neutralised if pasted into a spreadsheet.
 */

export interface SyntheticDataDrawerProps {
  open: boolean;
  entityName: string | null;
  result: SyntheticDataResult | null;
  isLoading: boolean;
  error: string | null;
  /** When the detail panel is open on the right, the drawer should
   *  inset on wide screens to avoid overlapping the panel. */
  panelOpen: boolean;
  onClose: () => void;
  onRegenerate: () => void;
}

export function SyntheticDataDrawer({
  open,
  entityName,
  result,
  isLoading,
  error,
  panelOpen,
  onClose,
  onRegenerate,
}: SyntheticDataDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copyAll() {
    if (!result) return;
    const headers = result.attributeNames.join('\t');
    const lines = result.rows.map((r) => rowToTsv(r, result.attributeNames));
    const text = [headers, ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Best-effort; most browsers support clipboard.writeText in
      // secure contexts. Silent failure here.
    }
  }

  return (
    <aside
      data-testid="synthetic-data-drawer"
      className={[
        'absolute inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-hidden',
        'border-t border-white/10 bg-surface-2/85 backdrop-blur-xl',
        'shadow-[0_-12px_32px_rgba(0,0,0,0.45)]',
        'transition-transform duration-200 ease-out translate-y-0',
        panelOpen ? 'lg:right-[360px]' : '',
      ].join(' ')}
    >
      <header className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">
          Synthetic preview
          {entityName && <span className="text-text-secondary"> — {entityName}</span>}
        </h3>
        <span
          data-testid="synthetic-badge"
          className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"
        >
          <AlertTriangle className="h-3 w-3" />
          Synthetic — not real
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-testid="synthetic-regenerate"
            onClick={onRegenerate}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50"
            title="Generate a fresh set of rows"
          >
            <RefreshCw className={['h-3 w-3', isLoading ? 'animate-spin' : ''].join(' ')} />
            Regenerate
          </button>
          <button
            type="button"
            data-testid="synthetic-copy"
            onClick={copyAll}
            disabled={!result || isLoading}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/15 px-2 py-1 text-[11px] text-accent hover:from-accent/25 hover:to-amber-500/25 disabled:opacity-50"
            title="Copy rows as tab-separated values (safe for spreadsheet paste)"
          >
            {copied ? <ClipboardCheck className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            aria-label="Close synthetic data drawer"
            data-testid="synthetic-close"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="max-h-[calc(60vh-3rem)] overflow-auto p-4">
        {isLoading && (
          <div data-testid="synthetic-loading" className="py-10 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-3 text-xs text-text-secondary">
              Asking Claude for {result?.rows.length ?? 10} plausible rows…
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div
            data-testid="synthetic-error"
            className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100"
          >
            {error}
          </div>
        )}

        {!isLoading && !error && result && (
          <div className="overflow-x-auto">
            <table data-testid="synthetic-table" className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-text-secondary">
                  {result.attributeNames.map((name) => (
                    <th key={name} className="border-b border-white/10 px-2 py-1.5 font-semibold">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    data-testid="synthetic-row"
                    className="even:bg-white/[0.02] hover:bg-accent/5"
                  >
                    {result.attributeNames.map((name) => {
                      const raw = row[name];
                      const safe = escapeClipboardCell(raw);
                      return (
                        <td
                          key={name}
                          className="border-b border-white/5 px-2 py-1 text-text-primary font-mono"
                          title={safe}
                        >
                          {raw === null || raw === undefined ? (
                            <span className="text-text-secondary/40 italic">null</span>
                          ) : (
                            safe
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[10px] text-text-secondary/60">
              Generated by {result.modelUsed} · {new Date(result.generatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
