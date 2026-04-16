import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { FolderKanban, Calendar, User2, Trash2 } from 'lucide-react';
import type { CreateProjectDTO } from '@cc/shared';

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
  const { projects, isLoading, createProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormClientName('');
    setFormStartDate('');
    setFormEndDate('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const dto: CreateProjectDTO = {
      name: formName.trim(),
      ...(formDescription.trim() && { description: formDescription.trim() }),
      ...(formClientName.trim() && { clientName: formClientName.trim() }),
      ...(formStartDate && { startDate: formStartDate }),
      ...(formEndDate && { endDate: formEndDate }),
    };

    const project = await createProject(dto);
    resetForm();
    setShowCreate(false);
    navigate(`/projects/${project.id}`);
  };

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Projects</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">
            Manage your data modelling engagements
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Project</Button>
      </div>

      {/* Create modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetForm();
        }}
        title="New Project"
        confirmLabel="Create"
        onConfirm={handleCreate as unknown as () => void}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. Q2 Content Campaign"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Description"
            placeholder="Brief description..."
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          <Input
            label="Client Name"
            placeholder="Client or team name"
            value={formClientName}
            onChange={(e) => setFormClientName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Start Date
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">End Date</label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          {/* Hidden submit for enter key */}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet."
          description="Create your first project to start organising your work with kanban boards."
          actionLabel="+ New Project"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      )}

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
