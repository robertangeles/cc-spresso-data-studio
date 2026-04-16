import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { useProject } from '../hooks/useProjects';
import { KanbanBoard } from '../components/projects/KanbanBoard';
import { ProjectSidebar } from '../components/projects/ProjectSidebar';
import { KanbanCardModal } from '../components/projects/KanbanCardModal';
import { SearchFilterBar, type FilterState } from '../components/projects/SearchFilterBar';
import type { KanbanCard, UpdateCardDTO, KanbanColumn } from '@cc/shared';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    project,
    isLoading,
    updateProject,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
    reorderCards,
  } = useProject(projectId!);

  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    priorities: new Set(),
    assigneeId: null,
    labelId: null,
  });

  const applyFilters = (cols: KanbanColumn[]): KanbanColumn[] => {
    const hasFilters =
      filters.query || filters.priorities.size > 0 || filters.assigneeId || filters.labelId;
    if (!hasFilters) return cols;
    return cols.map((col) => ({
      ...col,
      cards: col.cards.filter((card) => {
        if (filters.query && !card.title.toLowerCase().includes(filters.query.toLowerCase()))
          return false;
        if (filters.priorities.size > 0 && !filters.priorities.has(card.priority)) return false;
        if (filters.assigneeId && card.assigneeId !== filters.assigneeId) return false;
        if (filters.labelId && !(card.labels ?? []).some((l) => l.id === filters.labelId))
          return false;
        return true;
      }),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-text-tertiary">Project not found.</p>
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="text-accent hover:underline text-sm"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const columns = applyFilters(project.columns ?? []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </button>
          <div className="h-5 w-px bg-border-subtle" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-text-primary">{project.name}</h1>
            {project.clientName && (
              <p className="text-xs text-text-tertiary">{project.clientName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              project.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-400'
                : project.status === 'completed'
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'bg-slate-500/15 text-slate-400'
            }`}
          >
            {project.status}
          </span>
          <button
            type="button"
            className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
            title="Project settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Board + Sidebar */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Kanban Board */}
        <div className="flex-1 min-w-0 overflow-x-auto flex flex-col">
          <SearchFilterBar projectId={projectId!} filters={filters} onChange={setFilters} />
          <div className="flex-1 min-h-0">
            <KanbanBoard
              columns={columns}
              onCreateCard={async (columnId, title) => {
                await createCard({ columnId, title });
              }}
              onUpdateCard={async (cardId, data) => {
                await updateCard(cardId, data);
              }}
              onDeleteCard={async (cardId) => {
                await deleteCard(cardId);
              }}
              onMoveCard={async (cardId, data) => {
                await moveCard(cardId, data);
              }}
              onReorderCards={async (cardIds, columnId) => {
                await reorderCards(cardIds, columnId);
              }}
              onAddColumn={async (data) => {
                await addColumn(data);
              }}
              onUpdateColumn={async (columnId, data) => {
                await updateColumn(columnId, data);
              }}
              onDeleteColumn={async (columnId) => {
                await deleteColumn(columnId);
              }}
              onReorderColumns={async (columnIds) => {
                await reorderColumns(columnIds);
              }}
              onCardClick={setSelectedCard}
            />
          </div>
        </div>

        {/* Project Sidebar */}
        <ProjectSidebar
          project={project}
          onUpdate={async (u) => {
            await updateProject(u);
          }}
        />
      </div>

      {/* Card detail modal */}
      <KanbanCardModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={async (data: UpdateCardDTO) => {
          if (selectedCard) {
            await updateCard(selectedCard.id, data);
            setSelectedCard(null);
          }
        }}
        onDelete={async () => {
          if (selectedCard) {
            await deleteCard(selectedCard.id);
            setSelectedCard(null);
          }
        }}
      />
    </div>
  );
}
