import { useState, useRef } from 'react';
import {
  PanelRightClose,
  PanelRightOpen,
  User,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  BarChart3,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import type { ProjectWithBoard, UpdateProjectDTO, ProjectStatus } from '@cc/shared';
import { ActivityLog } from './ActivityLog';

interface ProjectSidebarProps {
  project: ProjectWithBoard;
  onUpdate?: (updates: UpdateProjectDTO) => Promise<void>;
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; style: string }> = [
  { value: 'active', label: 'Active', style: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'completed', label: 'Completed', style: 'bg-blue-500/15 text-blue-400' },
  { value: 'archived', label: 'Archived', style: 'bg-slate-500/15 text-slate-400' },
];

function InlineText({
  value,
  placeholder,
  multiline = false,
  onSave,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  const save = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      void save();
    }
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    const commonProps = {
      ref: inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: () => void save(),
      disabled: saving,
      className:
        'w-full rounded-lg border border-accent/40 bg-surface-2/50 px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all resize-none',
    };
    return (
      <div className="flex flex-col gap-1">
        {multiline ? (
          <textarea {...commonProps} rows={3} />
        ) : (
          <input {...commonProps} type="text" />
        )}
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              cancel();
            }}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              void save();
            }}
            className="p-1 rounded text-accent hover:bg-accent/10 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group flex items-start gap-1.5 w-full text-left"
    >
      <span
        className={`flex-1 text-sm ${value ? 'text-text-primary' : 'text-text-tertiary italic'} group-hover:text-accent transition-colors`}
      >
        {value || placeholder}
      </span>
      <Pencil className="h-3 w-3 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0" />
    </button>
  );
}

export function ProjectSidebar({ project, onUpdate }: ProjectSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // Card stats
  const columns = project.columns ?? [];
  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const doneCol = columns.find(
    (c) => c.name.toLowerCase() === 'done' || c.name.toLowerCase() === 'completed',
  );
  const doneCards = doneCol?.cards.length ?? 0;
  const progress = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;

  // Date timeline
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

  const contacts = (project.clientContacts ?? []) as Array<{
    name: string;
    email?: string;
    phone?: string;
    role?: string;
  }>;

  const handleSave = async (updates: UpdateProjectDTO) => {
    if (onUpdate) await onUpdate(updates);
  };

  const handleStatusChange = async (status: ProjectStatus) => {
    setSavingStatus(true);
    try {
      await handleSave({ status });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDateChange = async (field: 'startDate' | 'endDate', val: string) => {
    await handleSave({ [field]: val || null });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2/50 border border-border-subtle text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
        title="Open project sidebar"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="w-72 shrink-0 rounded-xl border border-border-subtle bg-surface-2/40 backdrop-blur-glass p-4 flex flex-col gap-5 animate-slide-up overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Project Info
        </h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
          title="Collapse sidebar"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editable project name */}
      {onUpdate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
            Name
          </p>
          <InlineText
            value={project.name}
            placeholder="Project name"
            onSave={(val) => handleSave({ name: val })}
          />
        </div>
      )}

      {/* Editable description */}
      {onUpdate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
            Description
          </p>
          <InlineText
            value={project.description ?? ''}
            placeholder="Add a description..."
            multiline
            onSave={(val) => handleSave({ description: val || null })}
          />
        </div>
      )}

      {/* Status picker */}
      {onUpdate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Status
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={savingStatus}
                onClick={() => void handleStatusChange(opt.value)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                  project.status === opt.value
                    ? `${opt.style} ring-1 ring-current/30 shadow-[0_0_8px_rgba(255,214,10,0.1)]`
                    : 'bg-surface-3/50 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editable client name */}
      {onUpdate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
            Client
          </p>
          <InlineText
            value={project.clientName ?? ''}
            placeholder="Client name..."
            onSave={(val) => handleSave({ clientName: val || null })}
          />
        </div>
      )}

      {/* Date pickers */}
      {onUpdate && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              Dates
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-text-tertiary mb-1">Start</p>
              <input
                type="date"
                defaultValue={project.startDate?.split('T')[0] ?? ''}
                onBlur={(e) => void handleDateChange('startDate', e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-2 py-1 text-xs text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
              />
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary mb-1">End</p>
              <input
                type="date"
                defaultValue={project.endDate?.split('T')[0] ?? ''}
                onBlur={(e) => void handleDateChange('endDate', e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-2 py-1 text-xs text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-text-secondary">Completion</span>
          </div>
          <span className="text-xs font-bold tabular-nums text-text-primary">{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-spring ${
              progress >= 100
                ? 'bg-emerald-500'
                : progress >= 50
                  ? 'bg-gradient-to-r from-accent to-emerald-500'
                  : 'bg-gradient-to-r from-amber-500 to-accent'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-text-tertiary">
          {doneCards} of {totalCards} cards done
        </p>
      </div>

      {/* Card counts per column */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-xs font-medium text-text-secondary">Board Status</span>
        </div>
        <div className="space-y-1.5">
          {columns.map((col) => (
            <div key={col.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      col.color === 'emerald'
                        ? '#10b981'
                        : col.color === 'blue'
                          ? '#3b82f6'
                          : col.color === 'amber'
                            ? '#f59e0b'
                            : '#64748b',
                  }}
                />
                <span className="text-[11px] text-text-secondary">{col.name}</span>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-text-primary">
                {col.cards.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {(startDate || endDate) && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="text-xs font-medium text-text-secondary">Timeline</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-1.5">
            <span>{startDate ? startDate.toLocaleDateString() : '...'}</span>
            <span>{endDate ? endDate.toLocaleDateString() : '...'}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-amber-500 transition-all duration-500"
              style={{ width: `${timelineProgress}%` }}
            />
          </div>
          {startDate && endDate && (
            <p className="mt-1 text-[10px] text-text-tertiary">
              {timelineProgress >= 100 ? 'Past deadline' : `${timelineProgress}% elapsed`}
            </p>
          )}
        </div>
      )}

      {/* Client info (read-only contacts) */}
      {!onUpdate && project.clientName && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Client
          </h4>
          <p className="text-sm font-medium text-text-primary">{project.clientName}</p>

          {contacts.length > 0 && (
            <div className="mt-2 space-y-2">
              {contacts.map((c, i) => (
                <div key={i} className="rounded-lg bg-surface-3/50 p-2.5 border border-white/5">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-text-tertiary" />
                    <span className="text-[11px] font-medium text-text-primary">{c.name}</span>
                    {c.role && (
                      <span className="text-[9px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-full">
                        {c.role}
                      </span>
                    )}
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Mail className="h-2.5 w-2.5 text-text-tertiary" />
                      <span className="text-[10px] text-text-tertiary">{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="h-2.5 w-2.5 text-text-tertiary" />
                      <span className="text-[10px] text-text-tertiary">{c.phone}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="flex-1 min-h-0">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
          Recent Activity
        </h4>
        <div className="h-48">
          <ActivityLog projectId={project.id} limit={10} />
        </div>
      </div>
    </div>
  );
}
