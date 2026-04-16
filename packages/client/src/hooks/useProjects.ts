import { useState, useEffect, useCallback } from 'react';
import type {
  ProjectWithBoard,
  KanbanColumn,
  KanbanCard,
  CreateProjectDTO,
  UpdateProjectDTO,
  CreateColumnDTO,
  UpdateColumnDTO,
  CreateCardDTO,
  UpdateCardDTO,
  MoveCardDTO,
  CardComment,
  CardAttachment,
  CreateAttachmentDTO,
} from '@cc/shared';
import { api } from '../lib/api';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectWithBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/projects');
      setProjects(data.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (dto: CreateProjectDTO) => {
    const { data } = await api.post('/projects', dto);
    setProjects((prev) => [data.data, ...prev]);
    return data.data as ProjectWithBoard;
  };

  const updateProject = async (id: string, updates: UpdateProjectDTO) => {
    const { data } = await api.put(`/projects/${id}`, updates);
    setProjects((prev) => prev.map((p) => (p.id === id ? data.data : p)));
    return data.data as ProjectWithBoard;
  };

  const deleteProject = async (id: string) => {
    await api.delete(`/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return { projects, isLoading, fetchProjects, createProject, updateProject, deleteProject };
}

export function useProject(projectId: string) {
  const [project, setProject] = useState<ProjectWithBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      setProject(data.data);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateProject = async (updates: UpdateProjectDTO) => {
    const { data } = await api.put(`/projects/${projectId}`, updates);
    // Merge updated fields into existing project — the PUT response is a flat row
    // without columns/cards, so replacing the whole project would lose board data.
    setProject((prev) => (prev ? { ...prev, ...data.data } : data.data));
    return data.data as ProjectWithBoard;
  };

  const deleteProject = async () => {
    await api.delete(`/projects/${projectId}`);
    setProject(null);
  };

  // Column operations
  const addColumn = async (dto: CreateColumnDTO) => {
    const { data } = await api.post(`/projects/${projectId}/columns`, dto);
    await refetch();
    return data.data as KanbanColumn;
  };

  const updateColumn = async (columnId: string, updates: UpdateColumnDTO) => {
    const { data } = await api.put(`/projects/${projectId}/columns/${columnId}`, updates);
    await refetch();
    return data.data as KanbanColumn;
  };

  const deleteColumn = async (columnId: string) => {
    await api.delete(`/projects/${projectId}/columns/${columnId}`);
    await refetch();
  };

  const reorderColumns = async (ids: string[]) => {
    await api.patch(`/projects/${projectId}/columns/reorder`, { ids });
    await refetch();
  };

  // Card operations
  const createCard = async (dto: CreateCardDTO) => {
    const { data } = await api.post(`/projects/${projectId}/cards`, dto);
    await refetch();
    return data.data as KanbanCard;
  };

  const updateCard = async (cardId: string, updates: UpdateCardDTO) => {
    const { data } = await api.put(`/projects/${projectId}/cards/${cardId}`, updates);
    await refetch();
    return data.data as KanbanCard;
  };

  const deleteCard = async (cardId: string) => {
    await api.delete(`/projects/${projectId}/cards/${cardId}`);
    await refetch();
  };

  const moveCard = async (cardId: string, dto: MoveCardDTO) => {
    // Optimistic: move card in local state immediately
    setProject((prev) => {
      if (!prev) return prev;
      let movedCard: KanbanCard | null = null;
      const columns = prev.columns.map((col) => {
        const found = col.cards.find((c) => c.id === cardId);
        if (found) movedCard = { ...found, columnId: dto.columnId, sortOrder: dto.sortOrder };
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
      });
      if (movedCard) {
        return {
          ...prev,
          columns: columns.map((col) => {
            if (col.id !== dto.columnId) return col;
            const cards = [...col.cards];
            cards.splice(Math.min(dto.sortOrder, cards.length), 0, movedCard!);
            return { ...col, cards: cards.map((c, i) => ({ ...c, sortOrder: i })) };
          }),
        };
      }
      return prev;
    });
    // Persist in background
    api.patch(`/projects/${projectId}/cards/${cardId}/move`, dto).catch(() => refetch());
  };

  const reorderCards = async (cardIds: string[], columnId: string) => {
    // Optimistic: reorder cards in local state immediately
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id !== columnId) return col;
          const cardMap = new Map(col.cards.map((c) => [c.id, c]));
          const reordered = cardIds.map((id) => cardMap.get(id)).filter(Boolean) as KanbanCard[];
          return { ...col, cards: reordered.map((c, i) => ({ ...c, sortOrder: i })) };
        }),
      };
    });
    // Persist in background
    api.patch(`/projects/${projectId}/cards/reorder`, { cardIds, columnId }).catch(() => refetch());
  };

  // Comment operations (return data directly, no full project refetch)
  const listComments = async (cardId: string): Promise<CardComment[]> => {
    const { data } = await api.get(`/projects/${projectId}/cards/${cardId}/comments`);
    return data.data;
  };

  const addComment = async (cardId: string, content: string): Promise<CardComment> => {
    const { data } = await api.post(`/projects/${projectId}/cards/${cardId}/comments`, { content });
    return data.data;
  };

  const updateComment = async (
    cardId: string,
    commentId: string,
    content: string,
  ): Promise<CardComment> => {
    const { data } = await api.put(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`, {
      content,
    });
    return data.data;
  };

  const deleteComment = async (cardId: string, commentId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`);
  };

  // Attachment operations (return data directly, no full project refetch)
  const listAttachments = async (cardId: string): Promise<CardAttachment[]> => {
    const { data } = await api.get(`/projects/${projectId}/cards/${cardId}/attachments`);
    return data.data;
  };

  const addAttachment = async (
    cardId: string,
    dto: CreateAttachmentDTO,
  ): Promise<CardAttachment> => {
    const { data } = await api.post(`/projects/${projectId}/cards/${cardId}/attachments`, dto);
    return data.data;
  };

  const deleteAttachment = async (cardId: string, attachmentId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/cards/${cardId}/attachments/${attachmentId}`);
  };

  return {
    project,
    isLoading,
    refetch,
    updateProject,
    deleteProject,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
    reorderCards,
    listComments,
    addComment,
    updateComment,
    deleteComment,
    listAttachments,
    addAttachment,
    deleteAttachment,
  };
}
