import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { FolderKanban, Calendar, User2, Trash2 } from 'lucide-react';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  archived: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  on_hold: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProjectsListPage() {
  const { projects, isLoading, deleteProject } = useProjects();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteProject(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet."
        description="Create your first project to start organising your work with kanban boards."
      />
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, i) => {
          const totalCards =
            project.columns?.reduce((sum, col) => sum + (col.cards?.length ?? 0), 0) ??
            project.totalCards ??
            0;

          return (
            <div
              key={project.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div
                onClick={() => navigate(`/projects/${project.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/projects/${project.id}`);
                }}
                role="button"
                tabIndex={0}
                className="group relative cursor-pointer rounded-xl border border-border-subtle bg-surface-2/50 backdrop-blur-glass p-5 transition-all duration-300 ease-spring hover:-translate-y-1 hover:shadow-dark-lg hover:border-accent/20"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="mt-0.5 truncate text-xs text-text-tertiary">
                        {project.description}
                      </p>
                    )}
                  </div>
                  {project.status && (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColors[project.status] ?? statusColors.active}`}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  {project.clientName && (
                    <span className="flex items-center gap-1">
                      <User2 className="h-3 w-3" />
                      {project.clientName}
                    </span>
                  )}
                  {(project.startDate || project.endDate) && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(project.startDate)}
                      {project.startDate && project.endDate && ' - '}
                      {formatDate(project.endDate)}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {totalCards > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-1">
                      <span>
                        {totalCards} card{totalCards !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-amber-500 transition-all duration-500"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(project.id);
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-status-error-dim transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Project"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      >
        <p>Permanently delete this project and all its columns and cards? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
