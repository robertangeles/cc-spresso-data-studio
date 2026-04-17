import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProjects';
import { useProjectChat } from '../hooks/useProjectChat';
import { KanbanBoard } from '../components/projects/KanbanBoard';
import { ProjectHeader } from '../components/projects/ProjectHeader';
import { ProjectChatSidebar } from '../components/projects/ProjectChatSidebar';
import { KanbanCardModal } from '../components/projects/KanbanCardModal';
import { SearchFilterBar, type FilterState } from '../components/projects/SearchFilterBar';
import { FocusModeToggle } from '../components/projects/FocusModeToggle';
import { api } from '../lib/api';
import type {
  KanbanCard,
  UpdateCardDTO,
  KanbanColumn,
  ProjectMember,
  ProjectWithBoard,
} from '@cc/shared';

const CHAT_WIDTH_KEY = 'cc:projectChat:width';
const FOCUS_MODE_KEY = 'cc:projectChat:focus';
const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 260;
const MAX_CHAT_WIDTH = 600;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Shell: fetches the project and gates on existence. Child hooks (chat, members
 * fetch, activity) ONLY mount inside the inner component once `project` is
 * confirmed non-null — this prevents a cascade of 404s when someone visits
 * a deleted or non-existent project URL.
 */
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const projectResult = useProject(projectId!);
  const { project, isLoading } = projectResult;

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

  return (
    <ProjectDetailInner projectId={projectId!} project={project} projectResult={projectResult} />
  );
}

interface ProjectDetailInnerProps {
  projectId: string;
  project: ProjectWithBoard;
  projectResult: ReturnType<typeof useProject>;
}

function ProjectDetailInner({ projectId, project, projectResult }: ProjectDetailInnerProps) {
  const navigate = useNavigate();
  const {
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
  } = projectResult;

  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    priorities: new Set(),
    assigneeId: null,
    labelId: null,
  });

  // Chat state — always visible unless focus mode
  const chat = useProjectChat(projectId);
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(FOCUS_MODE_KEY) === '1';
  });
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHAT_WIDTH;
    const stored = window.localStorage.getItem(CHAT_WIDTH_KEY);
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_CHAT_WIDTH;
    return clamp(
      Number.isFinite(parsed) ? parsed : DEFAULT_CHAT_WIDTH,
      MIN_CHAT_WIDTH,
      MAX_CHAT_WIDTH,
    );
  });

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(FOCUS_MODE_KEY, next ? '1' : '0');
      }
      return next;
    });
  }, []);

  const handleResizeChat = useCallback((next: number) => {
    const clamped = clamp(next, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
    setChatWidth(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHAT_WIDTH_KEY, String(clamped));
    }
  }, []);

  // Project members
  const [members, setMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    api
      .get(`/projects/${projectId}/members`)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => setMembers([]));
  }, [projectId]);

  // Mark read when chat is visible (not in focus mode)
  const { markRead, messages: chatMessages } = chat;
  useEffect(() => {
    if (!focusMode) {
      markRead();
    }
  }, [focusMode, chatMessages.length, markRead]);

  const handleMembersChange = useCallback((newMembers: ProjectMember[]) => {
    setMembers(newMembers);
  }, []);

  const handleDeleteProject = useCallback(async () => {
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

  const columns = applyFilters(project.columns ?? []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <ProjectHeader
        project={project}
        members={members}
        onUpdate={async (u) => {
          await updateProject(u);
        }}
        onMembersChange={handleMembersChange}
        onDelete={handleDeleteProject}
      />

      {/* Full-width toolbar: search/filters + focus mode toggle — spans above board AND chat */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex-1 min-w-0">
          <SearchFilterBar projectId={projectId} filters={filters} onChange={setFilters} />
        </div>
        <FocusModeToggle
          active={focusMode}
          unreadCount={chat.unreadCount}
          onToggle={toggleFocusMode}
        />
      </div>

      {/* Board + Chat Sidebar — tops aligned */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Kanban Board */}
        <div className="flex-1 min-w-0 overflow-x-auto flex flex-col">
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

        {/* Project Chat Sidebar — always visible unless Focus Mode */}
        {!focusMode && (
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
            onClose={toggleFocusMode}
            onTypingStart={chat.onTypingStart}
            onTypingStop={chat.onTypingStop}
            width={chatWidth}
            onResize={handleResizeChat}
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
    </div>
  );
}
