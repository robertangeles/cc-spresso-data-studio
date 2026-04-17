import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProjects';
import { useProjectChat } from '../hooks/useProjectChat';
import { KanbanBoard } from '../components/projects/KanbanBoard';
import { ProjectHeader } from '../components/projects/ProjectHeader';
import { ProjectChatSidebar } from '../components/projects/ProjectChatSidebar';
import { ProjectSettingsPanel } from '../components/projects/ProjectSettingsPanel';
import { KanbanCardModal } from '../components/projects/KanbanCardModal';
import { SearchFilterBar, type FilterState } from '../components/projects/SearchFilterBar';
import { api } from '../lib/api';
import type { KanbanCard, UpdateCardDTO, KanbanColumn, ProjectMember } from '@cc/shared';

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

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useProjectChat(projectId);

  // Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Project members
  const [members, setMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api
      .get(`/projects/${projectId}/members`)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => setMembers([]));
  }, [projectId]);

  // Mark read when chat is opened
  useEffect(() => {
    if (chatOpen) {
      chat.markRead();
    }
  }, [chatOpen, chat.messages.length]);

  const handleMembersChange = useCallback((newMembers: ProjectMember[]) => {
    setMembers(newMembers);
  }, []);

  const handleDeleteProject = useCallback(async () => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}`);
    navigate('/projects');
  }, [projectId, navigate]);

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
      {/* Compact Project Header */}
      <ProjectHeader
        project={project}
        members={members}
        onUpdate={async (u) => {
          await updateProject(u);
        }}
        onMembersChange={handleMembersChange}
        onToggleChat={() => setChatOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        chatOpen={chatOpen}
        unreadCount={chat.unreadCount}
      />

      {/* Board + Chat Sidebar */}
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

        {/* Project Chat Sidebar (collapsible) */}
        {chatOpen && (
          <ProjectChatSidebar
            messages={chat.messages}
            isLoading={chat.isLoading}
            hasMore={chat.hasMore}
            typingUsers={chat.typingUsers}
            memberCount={members.length}
            onSend={chat.sendMessage}
            onEdit={chat.editMessage}
            onDelete={chat.deleteMessage}
            onReact={chat.addReaction}
            onLoadMore={chat.loadMore}
            onClose={() => setChatOpen(false)}
            onTypingStart={chat.onTypingStart}
            onTypingStop={chat.onTypingStop}
          />
        )}
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

      {/* Settings Slide-Over */}
      <ProjectSettingsPanel
        project={project}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdate={async (u) => {
          await updateProject(u);
        }}
        onDelete={handleDeleteProject}
      />
    </div>
  );
}
