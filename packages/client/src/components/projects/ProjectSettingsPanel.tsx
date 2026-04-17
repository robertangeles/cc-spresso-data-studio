import { useState, useRef, useEffect } from 'react';
import { X, Calendar, CheckCircle2, BarChart3, Trash2, AlertTriangle } from 'lucide-react';
import type { ProjectWithBoard, UpdateProjectDTO, ProjectStatus } from '@cc/shared';
import { ActivityLog } from './ActivityLog';

interface ProjectSettingsPanelProps {
  project: ProjectWithBoard;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: UpdateProjectDTO) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; style: string }> = [
  { value: 'active', label: 'Active', style: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'completed', label: 'Completed', style: 'bg-blue-500/15 text-blue-400' },
  { value: 'archived', label: 'Archived', style: 'bg-slate-500/15 text-slate-400' },
];

export function ProjectSettingsPanel({
  project,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
}: ProjectSettingsPanelProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync state when project changes
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project.name, project.description]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (field: string, updates: UpdateProjectDTO) => {
    setSavingField(field);
    try {
      await onUpdate(updates);
    } finally {
      setSavingField(null);
    }
  };

  // Card stats
  const columns = project.columns ?? [];
  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const doneCol = columns.find(
    (c) => c.name.toLowerCase() === 'done' || c.name.toLowerCase() === 'completed',
  );
  const doneCards = doneCol?.cards.length ?? 0;
  const progress = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;

  // Timeline
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-surface-1 border-l border-border-subtle shadow-dark-lg overflow-y-auto animate-slide-left"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle sticky top-0 bg-surface-1 z-10">
          <h2 className="text-sm font-bold text-text-primary">Project Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* Name */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== project.name) {
                  void handleSave('name', { name: name.trim() });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                const val = description.trim();
                if (val !== (project.description ?? '')) {
                  void handleSave('description', { description: val || null });
                }
              }}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none transition-all"
              placeholder="Add a description..."
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2 block">
              Status
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingField === 'status'}
                  onClick={() => void handleSave('status', { status: opt.value })}
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

          {/* Dates */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Dates
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-text-tertiary mb-1">Start</p>
                <input
                  type="date"
                  defaultValue={project.startDate?.split('T')[0] ?? ''}
                  onBlur={(e) =>
                    void handleSave('startDate', { startDate: e.target.value || null })
                  }
                  className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-2 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
                />
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary mb-1">End</p>
                <input
                  type="date"
                  defaultValue={project.endDate?.split('T')[0] ?? ''}
                  onBlur={(e) => void handleSave('endDate', { endDate: e.target.value || null })}
                  className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-2 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Completion */}
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

          {/* Board Status */}
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

          {/* Recent Activity */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
              Recent Activity
            </h4>
            <div className="h-48">
              <ActivityLog projectId={project.id} limit={10} />
            </div>
          </div>

          {/* Danger Zone */}
          {onDelete && (
            <div className="border-t border-border-subtle pt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-3">
                Danger Zone
              </h4>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete this project
                </button>
              ) : (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">
                      This will permanently delete the project, all cards, columns, and chat
                      messages. This action cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-3 hover:bg-surface-3/80 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete()}
                      className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                    >
                      Delete permanently
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
