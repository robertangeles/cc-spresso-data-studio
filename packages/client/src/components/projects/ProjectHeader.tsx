import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  Settings2,
  MessageCircle,
  Building2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import type { ProjectWithBoard, UpdateProjectDTO, ProjectStatus, ProjectMember } from '@cc/shared';
import { MemberAssigner } from './MemberAssigner';
import { UnreadBadge } from '../community/UnreadBadge';
import { useOrganisation } from '../../hooks/useOrganisation';
import { api } from '../../lib/api';
import type { Client } from '@cc/shared';

interface ProjectHeaderProps {
  project: ProjectWithBoard;
  members: ProjectMember[];
  onUpdate: (updates: UpdateProjectDTO) => Promise<void>;
  onMembersChange: (members: ProjectMember[]) => void;
  onToggleChat: () => void;
  onOpenSettings: () => void;
  chatOpen: boolean;
  unreadCount: number;
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; style: string }> = [
  { value: 'active', label: 'Active', style: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'completed', label: 'Completed', style: 'bg-blue-500/15 text-blue-400' },
  { value: 'archived', label: 'Archived', style: 'bg-slate-500/15 text-slate-400' },
];

// ── Inline Name Editor ──────────────────────────────────────

function InlineName({ value, onSave }: { value: string; onSave: (val: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    await onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') {
            setEditing(false);
            setDraft(value);
          }
        }}
        onBlur={() => void save()}
        className="text-lg font-bold tracking-tight text-text-primary bg-transparent border-b-2 border-accent/40 focus:border-accent outline-none py-0 px-0 transition-colors"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="text-lg font-bold tracking-tight text-text-primary hover:text-accent transition-colors text-left"
      title="Click to rename"
    >
      {value}
    </button>
  );
}

// ── Status Dropdown ─────────────────────────────────────────

function StatusDropdown({
  status,
  onChange,
}: {
  status: ProjectStatus;
  onChange: (s: ProjectStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  const handleSelect = async (val: ProjectStatus) => {
    if (val === status) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setOpen(false);
    try {
      await onChange(val);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all hover:ring-1 hover:ring-current/30 ${current.style}`}
      >
        {saving ? 'Saving...' : current.label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-36 rounded-xl border border-border-subtle bg-surface-1 shadow-dark-lg backdrop-blur-glass overflow-hidden animate-slide-up">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => void handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-surface-3/60 ${
                opt.value === status ? `${opt.style} bg-surface-3/30` : 'text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client Dropdown ─────────────────────────────────────────

function ClientDropdown({
  clientId,
  clientName,
  onChange,
}: {
  clientId: string | null;
  clientName: string | null;
  onChange: (clientId: string | null, clientName: string | null) => Promise<void>;
}) {
  const { currentOrg } = useOrganisation();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !currentOrg?.id) return;
    setLoading(true);
    api
      .get('/clients', { params: { orgId: currentOrg.id } })
      .then(({ data }) => setClients(data.data ?? []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [open, currentOrg?.id]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all border ${
          clientId
            ? 'border-accent/20 bg-accent/5 text-accent hover:border-accent/40'
            : 'border-border-subtle bg-surface-2/50 text-text-tertiary hover:text-text-secondary hover:border-accent/20'
        }`}
      >
        <Building2 className="h-3 w-3" />
        <span className="truncate max-w-[120px]">{clientName ?? 'No client'}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border-subtle bg-surface-1 shadow-dark-lg backdrop-blur-glass overflow-hidden animate-slide-up">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void onChange(null, null);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-surface-3/60 ${
                  !clientId ? 'text-accent' : 'text-text-secondary'
                }`}
              >
                No client
              </button>
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void onChange(c.id, c.name);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-surface-3/60 ${
                    c.id === clientId ? 'text-accent bg-accent/5' : 'text-text-primary'
                  }`}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.industry && <span className="text-text-tertiary ml-1.5">· {c.industry}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ProjectHeader ──────────────────────────────────────

export function ProjectHeader({
  project,
  members,
  onUpdate,
  onMembersChange,
  onToggleChat,
  onOpenSettings,
  chatOpen,
  unreadCount,
}: ProjectHeaderProps) {
  // Card stats
  const columns = project.columns ?? [];
  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const doneCol = columns.find(
    (c) => c.name.toLowerCase() === 'done' || c.name.toLowerCase() === 'completed',
  );
  const doneCards = doneCol?.cards.length ?? 0;
  const progress = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;

  // Dates
  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.endDate ? new Date(project.endDate) : null;
  const formatDate = (d: Date) => d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });

  const handleClientChange = useCallback(
    async (_clientId: string | null, clientName: string | null) => {
      await onUpdate({ clientName: clientName ?? null });
    },
    [onUpdate],
  );

  return (
    <div className="shrink-0 mb-3">
      {/* Row 1: Name + Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <InlineName value={project.name} onSave={(name) => onUpdate({ name })} />
          <StatusDropdown
            status={project.status as ProjectStatus}
            onChange={(status) => onUpdate({ status })}
          />
          <ClientDropdown
            clientId={project.clientId ?? null}
            clientName={project.clientName ?? null}
            onChange={handleClientChange}
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Member avatars */}
          <MemberAssigner
            projectId={project.id}
            members={members}
            onMembersChange={onMembersChange}
          />

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
            title="Project settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {/* Chat toggle */}
          <button
            type="button"
            onClick={onToggleChat}
            className={`relative p-2 rounded-lg transition-all ${
              chatOpen
                ? 'bg-accent/15 text-accent shadow-[0_0_12px_rgba(255,214,10,0.15)]'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
            }`}
            title={chatOpen ? 'Close chat' : 'Open project chat'}
          >
            <MessageCircle className="h-4 w-4" />
            {!chatOpen && unreadCount > 0 && (
              <div className="absolute -top-1 -right-1">
                <UnreadBadge count={unreadCount} />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Description + dates + progress */}
      <div className="flex items-center gap-3 mt-1.5 text-xs text-text-tertiary flex-wrap">
        {project.description && (
          <span className="truncate max-w-[300px]" title={project.description}>
            {project.description}
          </span>
        )}

        {(startDate || endDate) && (
          <>
            {project.description && <span className="text-border-subtle">·</span>}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {startDate ? formatDate(startDate) : '...'}
              <span className="text-text-tertiary/50">→</span>
              {endDate ? formatDate(endDate) : '...'}
            </span>
          </>
        )}

        {totalCards > 0 && (
          <>
            <span className="text-border-subtle">·</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              <span>
                {doneCards}/{totalCards} done
              </span>
              {/* Mini progress bar */}
              <div className="h-1.5 w-16 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress >= 100
                      ? 'bg-emerald-500'
                      : progress >= 50
                        ? 'bg-gradient-to-r from-accent to-emerald-500'
                        : 'bg-gradient-to-r from-amber-500 to-accent'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-text-tertiary/70 tabular-nums">{progress}%</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
