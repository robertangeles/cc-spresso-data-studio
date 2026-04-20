import { useEffect, useState } from 'react';
import {
  History as HistoryIcon,
  AlertCircle,
  Loader2,
  Plus,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AttributeHistoryEvent } from '../../../hooks/useAttributes';
import { formatAuditEvent } from '../../../lib/auditFormatter';

/**
 * History tab — read-only timeline of change_log events for the
 * currently-selected attribute. Lazy-fetched on mount per attr; the
 * useAttributes hook caches per-attrId across tab-switches so this
 * component never re-fetches unless invalidated.
 */

export interface HistoryTabProps {
  entityId: string;
  attributeId: string;
  loadHistory: (entityId: string, attrId: string) => Promise<AttributeHistoryEvent[]>;
}

export function HistoryTab({ entityId, attributeId, loadHistory }: HistoryTabProps) {
  const [events, setEvents] = useState<AttributeHistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setEvents(null);
    loadHistory(entityId, attributeId)
      .then((e) => {
        if (!cancelled) setEvents(e);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, attributeId, loadHistory]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-text-secondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-start gap-2 p-4 text-xs text-red-200">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <HistoryIcon className="h-5 w-5 text-text-secondary/60" />
        <p className="text-xs text-text-secondary">
          No history yet — mutations appear here as the audit log fills up.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-1.5 px-4 py-3">
      {/* Left rail connecting the events. Subtle, so the entries stay foreground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-3 left-[25px] top-3 w-px bg-white/5"
      />
      {events.map((event) => (
        <HistoryRow key={event.id} event={event} />
      ))}
    </ol>
  );
}

function HistoryRow({ event }: { event: AttributeHistoryEvent }) {
  const icon = ACTION_ICONS[event.action] ?? <Pencil className="h-2.5 w-2.5" />;
  const tone = ACTION_TONES[event.action] ?? 'text-text-secondary border-white/10 bg-surface-2/60';
  const lines = formatAuditEvent(event);
  return (
    <li
      data-testid="history-row"
      data-action={event.action}
      className="relative flex items-start gap-3 rounded-md border border-white/5 bg-surface-1/30 px-3 py-2"
    >
      <span
        className={[
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          tone,
        ].join(' ')}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary/70">
            {event.action}
          </span>
          <time
            className="shrink-0 font-mono text-[10px] text-text-secondary/70"
            title={new Date(event.createdAt).toLocaleString()}
          >
            {relativeTime(event.createdAt)}
          </time>
        </div>
        <ul className="mt-0.5 space-y-0.5">
          {lines.map((line, idx) => (
            <li
              key={idx}
              className="text-[11px] leading-snug text-text-primary"
              // Code-style markers `like this` are rendered as subtle
              // monospace highlights without a heavy full Markdown parse.
              dangerouslySetInnerHTML={{
                __html: line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(
                    /`([^`]+)`/g,
                    '<code class="rounded bg-surface-2/70 px-1 py-0.5 font-mono text-[10px] text-accent/80">$1</code>',
                  ),
              }}
            />
          ))}
        </ul>
      </div>
    </li>
  );
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="h-2.5 w-2.5" />,
  update: <Pencil className="h-2.5 w-2.5" />,
  delete: <Trash2 className="h-2.5 w-2.5" />,
  synthetic_generated: <Sparkles className="h-2.5 w-2.5" />,
};

const ACTION_TONES: Record<string, string> = {
  create: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10',
  update: 'text-accent border-accent/40 bg-accent/10',
  delete: 'text-red-200 border-red-400/40 bg-red-500/10',
  synthetic_generated: 'text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-500/10',
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
