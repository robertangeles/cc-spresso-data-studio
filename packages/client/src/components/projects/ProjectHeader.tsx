import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  Building2,
  CheckCircle2,
  Calendar,
  MoreHorizontal,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { ProjectWithBoard, UpdateProjectDTO, ProjectStatus, ProjectMember } from '@cc/shared';
import { MemberAssigner } from './MemberAssigner';
import { useOrganisation } from '../../hooks/useOrganisation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Client } from '@cc/shared';

interface ProjectHeaderProps {
  project: ProjectWithBoard;
  members: ProjectMember[];
  onUpdate: (updates: UpdateProjectDTO) => Promise<void>;
  onMembersChange: (members: ProjectMember[]) => void;
  onDelete?: () => Promise<void>;
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; style: string }> = [
  { value: 'active', label: 'Active', style: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'completed', label: 'Completed', style: 'bg-blue-500/15 text-blue-400' },
  { value: 'archived', label: 'Archived', style: 'bg-slate-500/15 text-slate-400' },
];

const columnColor = (c?: string | null): string => {
  switch (c) {
    case 'emerald':
      return '#10b981';
    case 'blue':
      return '#3b82f6';
    case 'amber':
      return '#f59e0b';
    case 'rose':
      return '#f43f5e';
    case 'violet':
      return '#8b5cf6';
    default:
      return '#64748b';
  }
};

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

// ── Inline Description Editor ──────────────────────────────

function InlineDescription({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (val: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '')) {
      await onSave(trimmed || null);
    }
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
            setDraft(value ?? '');
          }
        }}
        onBlur={() => void save()}
        placeholder="Add a description..."
        className="text-xs text-text-secondary bg-transparent border-b border-accent/40 focus:border-accent outline-none py-0 px-0 min-w-[240px] max-w-[460px] flex-1"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="text-xs truncate max-w-[460px] text-text-tertiary hover:text-accent transition-colors text-left"
      title={value ?? 'Click to add a description'}
    >
      {value ?? <span className="italic text-text-tertiary/60">Add a description…</span>}
    </button>
  );
}

// ── Inline Date Editor ─────────────────────────────────────

function InlineDate({
  value,
  placeholder,
  onSave,
}: {
  value: string | null | undefined;
  placeholder: string;
  onSave: (val: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const dateVal = value ? value.split('T')[0] : '';
  const display = value
    ? new Date(value).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
    : placeholder;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={dateVal}
        onBlur={(e) => {
          const next = e.target.value || null;
          if (next !== (value ?? null)) {
            void onSave(next);
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
        className="text-[10px] tabular-nums bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-text-primary [color-scheme:dark] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={`tabular-nums hover:text-accent transition-colors ${value ? '' : 'italic opacity-60'}`}
      title="Click to edit"
    >
      {display}
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

// ── Overflow Menu (Delete) ──────────────────────────────────

function OverflowMenu({ onDelete }: { onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
        title="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-border-subtle bg-surface-1 shadow-dark-lg backdrop-blur-glass overflow-hidden animate-slide-up">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete project
            </button>
          ) : (
            <div className="p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-300 leading-relaxed">
                  Permanently delete this project, all cards, columns, and chat. Cannot be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setOpen(false);
                  }}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-text-secondary bg-surface-3 hover:bg-surface-3/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
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
  onDelete,
}: ProjectHeaderProps) {
  const { user } = useAuth();
  const { orgDetail } = useOrganisation();
  const myOrgRole = orgDetail?.members.find((m) => m.userId === user?.id)?.role;
  const isCreator = project.userId === user?.id;
  const canManage = isCreator || myOrgRole === 'owner' || myOrgRole === 'admin';
  // Card stats
  const columns = project.columns ?? [];
  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const doneCol = columns.find(
    (c) => c.name.toLowerCase() === 'done' || c.name.toLowerCase() === 'completed',
  );
  const doneCards = doneCol?.cards.length ?? 0;
  const progress = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;

  // Dates + timeline
  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.endDate ? new Date(project.endDate) : null;
  const now = new Date();
  let timelineProgress = 0;
  if (startDate && endDate) {
    const total = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    timelineProgress =
      total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 0;
  }

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
          <MemberAssigner
            projectId={project.id}
            members={members}
            onMembersChange={onMembersChange}
            canManage={canManage}
          />

          {onDelete && canManage && <OverflowMenu onDelete={onDelete} />}
        </div>
      </div>

      {/* Row 2: Description (inline editable) + done chip */}
      <div className="flex items-center gap-3 mt-1.5 text-xs">
        <InlineDescription
          value={project.description ?? null}
          onSave={(val) => onUpdate({ description: val })}
        />

        {totalCards > 0 && (
          <>
            <span className="text-border-subtle">·</span>
            <span className="flex items-center gap-1.5 text-text-tertiary">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              <span className="tabular-nums">
                {doneCards}/{totalCards} done
              </span>
              <span className="text-accent/80 font-semibold tabular-nums">{progress}%</span>
            </span>
          </>
        )}
      </div>

      {/* Row 3: Pipeline Bar — segments proportional to card counts */}
      {columns.length > 0 && (
        <div className="mt-2 flex items-stretch gap-1">
          {columns.map((col) => {
            const color = columnColor(col.color);
            const count = col.cards.length;
            const flexGrow = totalCards > 0 ? Math.max(count, 0.35) : 1;
            const isDone =
              col.name.toLowerCase() === 'done' || col.name.toLowerCase() === 'completed';
            return (
              <div
                key={col.id}
                style={{
                  flex: `${flexGrow} 1 0`,
                  background: `linear-gradient(180deg, ${color}1f 0%, ${color}08 100%)`,
                  borderColor: `${color}40`,
                  boxShadow:
                    isDone && count > 0
                      ? `inset 0 0 0 1px ${color}25, 0 0 14px ${color}26`
                      : `inset 0 0 0 1px ${color}12`,
                }}
                className="relative group rounded-lg border h-8 px-2.5 flex items-center justify-between overflow-hidden transition-all duration-200 hover:-translate-y-px hover:brightness-110 min-w-0"
                title={`${col.name}: ${count} ${count === 1 ? 'card' : 'cards'}`}
              >
                {isDone && count > 0 && (
                  <div
                    className="pointer-events-none absolute inset-0 opacity-40"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${color}20 50%, transparent 100%)`,
                    }}
                  />
                )}
                <div className="flex items-center gap-1.5 min-w-0 relative">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: count > 0 ? `0 0 6px ${color}` : 'none',
                    }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary truncate">
                    {col.name}
                  </span>
                </div>
                <span
                  className="text-xs font-bold tabular-nums ml-2 relative"
                  style={{ color: count > 0 ? color : '#64748b' }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Row 4: Timeline strip with glowing "now" marker — dates inline editable */}
      <div className="mt-2 flex items-center gap-2.5 text-[10px] text-text-tertiary">
        <Calendar className="h-3 w-3 shrink-0" />
        <div className="min-w-[50px]">
          <InlineDate
            value={project.startDate}
            placeholder="start"
            onSave={(val) => onUpdate({ startDate: val })}
          />
        </div>
        <div className="flex-1 relative h-1.5 rounded-full bg-surface-3 overflow-visible">
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                timelineProgress >= 100
                  ? 'bg-gradient-to-r from-rose-500 to-red-500'
                  : 'bg-gradient-to-r from-amber-500 via-accent to-amber-400'
              }`}
              style={{ width: `${timelineProgress}%` }}
            />
          </div>
          {timelineProgress > 0 && timelineProgress < 100 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-accent ring-2 ring-surface-1"
              style={{
                left: `${timelineProgress}%`,
                boxShadow: '0 0 10px rgba(255,214,10,0.9), 0 0 20px rgba(255,214,10,0.4)',
              }}
            />
          )}
        </div>
        <div className="min-w-[50px] text-right">
          <InlineDate
            value={project.endDate}
            placeholder="end"
            onSave={(val) => onUpdate({ endDate: val })}
          />
        </div>
        {startDate && endDate && (
          <span
            className={`tabular-nums font-semibold min-w-[44px] text-right ${
              timelineProgress >= 100 ? 'text-rose-400' : 'text-accent'
            }`}
          >
            {timelineProgress >= 100 ? 'overdue' : `${timelineProgress}%`}
          </span>
        )}
      </div>
    </div>
  );
}
