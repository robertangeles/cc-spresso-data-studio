import { useState } from 'react';
import {
  PanelRightClose,
  PanelRightOpen,
  User,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import type { ProjectWithBoard } from '@cc/shared';

interface ProjectSidebarProps {
  project: ProjectWithBoard;
}

export function ProjectSidebar({ project }: ProjectSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="w-72 shrink-0 rounded-xl border border-border-subtle bg-surface-2/40 backdrop-blur-glass p-4 space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Client info */}
      {project.clientName && (
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
    </div>
  );
}
