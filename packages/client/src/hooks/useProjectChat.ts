import { useState, useEffect, useCallback, useRef } from 'react';
import { useCommunitySocket } from './useCommunitySocket';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { ProjectChatMessage } from '@cc/shared';
import type { ReactionGroup } from '@cc/shared';

interface UseProjectChatReturn {
  messages: ProjectChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  typingUsers: Array<{ userId: string; name: string }>;
  unreadCount: number;
  sendMessage: (content: string, parentId?: string) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  loadMore: () => void;
  markRead: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
}

export function useProjectChat(projectId: string | undefined): UseProjectChatReturn {
  const { socket } = useCommunitySocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const joinedRef = useRef(false);

  // Join project chat room
  useEffect(() => {
    if (!socket || !projectId) return;

    socket.emit('project:join', { projectId });
    joinedRef.current = true;

    return () => {
      if (joinedRef.current) {
        socket.emit('project:leave', { projectId });
        joinedRef.current = false;
      }
    };
  }, [socket, projectId]);

  // Load initial messages via REST
  useEffect(() => {
    if (!projectId) return;

    setIsLoading(true);
    setMessages([]);

    api
      .get(`/projects/${projectId}/chat/messages`, { params: { limit: 50 } })
      .then(({ data }) => {
        const result = data.data;
        setMessages(result.messages.reverse()); // oldest first for display
        setHasMore(result.hasMore);
      })
      .catch(() => {
        setMessages([]);
        setHasMore(false);
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  // Load unread count
  useEffect(() => {
    if (!projectId) return;

    api
      .get(`/projects/${projectId}/chat/unread`)
      .then(({ data }) => setUnreadCount(data.data.unreadCount))
      .catch(() => setUnreadCount(0));
  }, [projectId]);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleNewMessage = (msg: ProjectChatMessage) => {
      if (msg.projectId !== projectId) return;
      setMessages((prev) => [...prev, msg]);

      // If it's from someone else, increment unread
      if (msg.userId !== user?.id) {
        setUnreadCount((c) => c + 1);
      }
    };

    const handleEditMessage = (data: { messageId: string; content: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, content: data.content, isEdited: true } : m,
        ),
      );
    };

    const handleDeleteMessage = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const handleTyping = (data: {
      projectId: string;
      userId: string;
      name: string;
      isTyping: boolean;
    }) => {
      if (data.projectId !== projectId || data.userId === user?.id) return;

      setTypingUsers((prev) => {
        if (data.isTyping) {
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, name: data.name }];
        }
        return prev.filter((u) => u.userId !== data.userId);
      });
    };

    const handleReactionUpdate = (data: { messageId: string; reactions: ReactionGroup[] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)),
      );
    };

    const handleUnreadUpdate = () => {
      setUnreadCount(0);
    };

    socket.on('project:message:new', handleNewMessage);
    socket.on('project:message:edit', handleEditMessage);
    socket.on('project:message:delete', handleDeleteMessage);
    socket.on('project:typing:update', handleTyping);
    socket.on('project:reaction:update', handleReactionUpdate);
    socket.on('project:unread:update', handleUnreadUpdate);

    return () => {
      socket.off('project:message:new', handleNewMessage);
      socket.off('project:message:edit', handleEditMessage);
      socket.off('project:message:delete', handleDeleteMessage);
      socket.off('project:typing:update', handleTyping);
      socket.off('project:reaction:update', handleReactionUpdate);
      socket.off('project:unread:update', handleUnreadUpdate);
    };
  }, [socket, projectId, user?.id]);

  const sendMessage = useCallback(
    (content: string, parentId?: string) => {
      if (!socket || !projectId) return;
      socket.emit('project:message:send', { projectId, content, parentId });
    },
    [socket, projectId],
  );

  const editMessage = useCallback(
    (messageId: string, content: string) => {
      if (!socket || !projectId) return;
      socket.emit('project:message:edit', { messageId, content, projectId });
    },
    [socket, projectId],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket || !projectId) return;
      socket.emit('project:message:delete', { messageId, projectId });
    },
    [socket, projectId],
  );

  const addReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket || !projectId) return;
      socket.emit('project:reaction:add', { messageId, emoji, projectId });
    },
    [socket, projectId],
  );

  const removeReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket || !projectId) return;
      socket.emit('project:reaction:remove', { messageId, emoji, projectId });
    },
    [socket, projectId],
  );

  const loadMore = useCallback(() => {
    if (!projectId || !hasMore || isLoading || messages.length === 0) return;

    const oldest = messages[0];
    api
      .get(`/projects/${projectId}/chat/messages`, {
        params: { before: oldest.createdAt, limit: 50 },
      })
      .then(({ data }) => {
        const result = data.data;
        setMessages((prev) => [...result.messages.reverse(), ...prev]);
        setHasMore(result.hasMore);
      })
      .catch(() => {});
  }, [projectId, hasMore, isLoading, messages]);

  const markRead = useCallback(() => {
    if (!socket || !projectId || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    socket.emit('project:read:update', { projectId, messageId: lastMsg.id });
    setUnreadCount(0);
  }, [socket, projectId, messages]);

  const onTypingStart = useCallback(() => {
    if (!socket || !projectId) return;
    socket.emit('project:typing:start', { projectId });
  }, [socket, projectId]);

  const onTypingStop = useCallback(() => {
    if (!socket || !projectId) return;
    socket.emit('project:typing:stop', { projectId });
  }, [socket, projectId]);

  return {
    messages,
    isLoading,
    hasMore,
    typingUsers,
    unreadCount,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    loadMore,
    markRead,
    onTypingStart,
    onTypingStop,
  };
}
