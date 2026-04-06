import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCommunitySocket } from '../hooks/useCommunitySocket';
import {
  useChannels,
  useMessages,
  useUnreadCounts,
  useChannelMembers,
  markChannelRead,
  joinChannel,
} from '../hooks/useCommunity';
import { useDMConversations, useDMMessages, createDMConversation } from '../hooks/useDMs';
import { useBacklogItems } from '../hooks/useBacklog';
import { getAccessToken } from '../lib/api';
import { ChannelSidebar } from '../components/community/ChannelSidebar';
import { MessageArea } from '../components/community/MessageArea';
import { MemberPanel } from '../components/community/MemberPanel';
import { BacklogBoard } from '../components/community/BacklogBoard';
import type {
  CommunityChannel,
  CommunityMessage,
  DirectConversation,
  MessageAttachment,
  ReactionGroup,
} from '@cc/shared';

type ViewMode = 'channel' | 'dm' | 'backlog';

export function CommunityPage() {
  const { '*': routeWild } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Socket
  const { socket, isConnected, onlineUsers, connect, disconnect } = useCommunitySocket();

  // Data hooks
  const { channels, loading: channelsLoading } = useChannels();
  const { conversations: dmConversations, refetch: refetchDMs } = useDMConversations();
  const { unreadCounts, refetch: refetchUnreads } = useUnreadCounts();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('channel');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDMId, setActiveDMId] = useState<string | null>(null);
  const [memberPanelOpen, setMemberPanelOpen] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Active channel object
  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  // Messages for current channel
  const {
    messages,
    loading: messagesLoading,
    hasMore: hasMoreMessages,
    addMessage,
    loadMore,
    setMessages,
  } = useMessages(viewMode === 'channel' ? activeChannelId : null);

  // DM messages for current conversation
  const {
    messages: dmMessages,
    loading: dmMessagesLoading,
    hasMore: dmHasMore,
    addMessage: addDMMessage,
    loadMore: dmLoadMore,
  } = useDMMessages(viewMode === 'dm' ? activeDMId : null);

  // Members for current channel
  const members = useChannelMembers(viewMode === 'channel' ? activeChannelId : null);

  // Backlog preview (top 3 by score)
  const {
    items: backlogItems,
    vote: backlogVote,
    removeVote: backlogRemoveVote,
  } = useBacklogItems();
  const backlogPreview = useMemo(
    () => [...backlogItems].sort((a, b) => b.score - a.score).slice(0, 3),
    [backlogItems],
  );

  // Online user IDs as a Set
  const onlineUserIds = useMemo(() => new Set(onlineUsers.keys()), [onlineUsers]);

  // Active DM conversation info
  const activeDMConvo = useMemo(
    () => dmConversations.find((c) => c.conversationId === activeDMId) ?? null,
    [dmConversations, activeDMId],
  );

  // Is current user an admin (role-based check)
  const isAdmin = user?.role === 'Administrator';

  // ── Connect socket on mount ────────────────────────────────
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      connect(token);
    }
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // ── Route parsing ──────────────────────────────────────────
  useEffect(() => {
    if (!channels.length) return;

    // Parse route: channel/:slug, dm/:id, backlog, or empty (default)
    const parts = routeWild?.split('/') ?? [];

    if (parts[0] === 'channel' && parts[1]) {
      const channel = channels.find((c) => c.slug === parts[1]);
      if (channel) {
        setViewMode('channel');
        setActiveChannelId(channel.id);
        return;
      }
    }

    if (parts[0] === 'dm' && parts[1]) {
      setViewMode('dm');
      setActiveDMId(parts[1]);
      return;
    }

    if (parts[0] === 'backlog') {
      setViewMode('backlog');
      return;
    }

    // Default: first channel (usually #general)
    const defaultChannel = channels.find((c) => c.isDefault) ?? channels[0];
    if (defaultChannel) {
      setViewMode('channel');
      setActiveChannelId(defaultChannel.id);
      navigate(`/community/channel/${defaultChannel.slug}`, { replace: true });
    }
  }, [routeWild, channels, navigate]);

  // ── Socket: join/leave channel rooms ───────────────────────
  useEffect(() => {
    if (!socket || !isConnected || viewMode !== 'channel' || !activeChannelId) return;

    socket.emit('channel:join', { channelId: activeChannelId });
    // Auto-join channel (creates channel_members row) so user appears in member list
    joinChannel(activeChannelId).catch(() => {});
    markChannelRead(activeChannelId).catch(() => {});
    refetchUnreads();

    return () => {
      socket.emit('channel:leave', { channelId: activeChannelId });
      setTypingUsers([]);
    };
  }, [socket, isConnected, viewMode, activeChannelId, refetchUnreads]);

  // ── Socket: join/leave DM rooms ───────────────────────────
  useEffect(() => {
    if (!socket || !isConnected || viewMode !== 'dm' || !activeDMId) return;

    socket.emit('dm:join', { conversationId: activeDMId });

    return () => {
      socket.emit('dm:leave', { conversationId: activeDMId });
    };
  }, [socket, isConnected, viewMode, activeDMId]);

  // ── Socket event listeners ─────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: CommunityMessage) => {
      if (msg.channelId === activeChannelId) {
        addMessage(msg);
      }
      refetchUnreads();
    };

    const handleMessageEdit = (data: { messageId: string; content: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, content: data.content, isEdited: true } : m,
        ),
      );
    };

    const handleMessageDelete = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const handleReactionUpdate = (data: { messageId: string; reactions: ReactionGroup[] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)),
      );
    };

    const handleTypingUpdate = (data: {
      channelId: string;
      userId: string;
      name: string;
      isTyping: boolean;
    }) => {
      if (data.channelId !== activeChannelId) return;
      if (data.userId === user?.id) return;

      if (data.isTyping) {
        setTypingUsers((prev) => {
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, name: data.name }];
        });

        // Auto-remove after 3s if no stop event
        const existing = typingTimeoutsRef.current.get(data.userId);
        if (existing) clearTimeout(existing);
        typingTimeoutsRef.current.set(
          data.userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
            typingTimeoutsRef.current.delete(data.userId);
          }, 3000),
        );
      } else {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        const existing = typingTimeoutsRef.current.get(data.userId);
        if (existing) {
          clearTimeout(existing);
          typingTimeoutsRef.current.delete(data.userId);
        }
      }
    };

    const handleLinkPreview = (data: { messageId: string; attachments: MessageAttachment[] }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, attachments: [...m.attachments, ...data.attachments] }
            : m,
        ),
      );
    };

    const handleUnreadUpdate = () => {
      refetchUnreads();
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:edit', handleMessageEdit);
    socket.on('message:delete', handleMessageDelete);
    socket.on('reaction:update', handleReactionUpdate);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('message:link_preview', handleLinkPreview);
    socket.on('unread:update', handleUnreadUpdate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('dm:message:new', (msg: any) => {
      // Add message to DM view if we're in the right conversation
      if (msg.conversationId === activeDMId) {
        addDMMessage(msg);
      }
      refetchDMs();
    });

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:edit', handleMessageEdit);
      socket.off('message:delete', handleMessageDelete);
      socket.off('reaction:update', handleReactionUpdate);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('message:link_preview', handleLinkPreview);
      socket.off('unread:update', handleUnreadUpdate);
      socket.off('dm:message:new');
    };
  }, [
    socket,
    activeChannelId,
    activeDMId,
    user?.id,
    addMessage,
    addDMMessage,
    setMessages,
    refetchUnreads,
    refetchDMs,
  ]);

  // ── Handlers ───────────────────────────────────────────────
  const handleSelectChannel = useCallback(
    (channel: CommunityChannel) => {
      setViewMode('channel');
      setActiveChannelId(channel.id);
      navigate(`/community/channel/${channel.slug}`);
    },
    [navigate],
  );

  const handleSelectDM = useCallback(
    (convo: DirectConversation) => {
      setViewMode('dm');
      setActiveDMId(convo.conversationId);
      navigate(`/community/dm/${convo.conversationId}`);
    },
    [navigate],
  );

  const handleSelectBacklog = useCallback(() => {
    setViewMode('backlog');
    navigate('/community/backlog');
  }, [navigate]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeChannelId || !socket) return;
      socket.emit('message:send', { channelId: activeChannelId, content });
    },
    [activeChannelId, socket],
  );

  const handleSendDM = useCallback(
    async (content: string) => {
      if (!activeDMId || !socket) return;
      // Send via socket for real-time delivery to both users
      socket.emit('dm:message:send', { conversationId: activeDMId, content });
    },
    [activeDMId, socket],
  );

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket || !activeChannelId) return;
      // Determine if user already reacted
      const msg = messages.find((m) => m.id === messageId);
      const existing = msg?.reactions.find((r) => r.emoji === emoji);
      if (existing?.hasReacted) {
        socket.emit('reaction:remove', { messageId, emoji, channelId: activeChannelId });
      } else {
        socket.emit('reaction:add', { messageId, emoji, channelId: activeChannelId });
      }
    },
    [socket, activeChannelId, messages],
  );

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      if (!socket) return;
      // Use API for edit (socket doesn't handle edits in the current spec)
      import('../lib/api').then(({ api }) => {
        api.put(`/community/messages/${messageId}`, { content }).catch(() => {});
      });
    },
    [socket],
  );

  const handleDelete = useCallback((messageId: string) => {
    import('../lib/api').then(({ api }) => {
      api.delete(`/community/messages/${messageId}`).catch(() => {});
    });
  }, []);

  const handleTypingStart = useCallback(() => {
    if (socket && activeChannelId) {
      socket.emit('typing:start', { channelId: activeChannelId });
    }
  }, [socket, activeChannelId]);

  const handleTypingStop = useCallback(() => {
    if (socket && activeChannelId) {
      socket.emit('typing:stop', { channelId: activeChannelId });
    }
  }, [socket, activeChannelId]);

  const handleStartDM = useCallback(
    async (userId: string) => {
      try {
        const convo = await createDMConversation(userId);
        await refetchDMs();
        setActiveDMId(convo.conversationId);
        setViewMode('dm');
        navigate(`/community/dm/${convo.conversationId}`);
      } catch {
        // Non-blocking
      }
    },
    [navigate, refetchDMs],
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="flex h-full overflow-hidden bg-surface-0"
      style={{
        background:
          'radial-gradient(ellipse at 20% 0%, rgba(255,214,10,0.03) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(255,214,10,0.02) 0%, transparent 50%), #0a0a0b',
      }}
    >
      <ChannelSidebar
        channels={channels}
        dmConversations={dmConversations}
        activeChannelId={activeChannelId}
        activeDMId={activeDMId}
        activeView={viewMode}
        unreadCounts={unreadCounts}
        onlineUserIds={onlineUserIds}
        onSelectChannel={handleSelectChannel}
        onSelectDM={handleSelectDM}
        onSelectBacklog={handleSelectBacklog}
        isAdmin={isAdmin}
        loading={channelsLoading}
      />

      {viewMode === 'backlog' ? (
        <BacklogBoard isAdmin={isAdmin} />
      ) : viewMode === 'channel' ? (
        <div className="flex-1 flex relative">
          <MessageArea
            channel={activeChannel}
            messages={messages}
            messagesLoading={messagesLoading}
            hasMoreMessages={hasMoreMessages}
            typingUsers={typingUsers}
            onSendMessage={handleSendMessage}
            onReact={handleReact}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onLoadMore={loadMore}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            onToggleMembers={() => setMemberPanelOpen(!memberPanelOpen)}
            isAdmin={isAdmin}
          />
          {memberPanelOpen && (
            <MemberPanel
              members={members}
              onlineUserIds={onlineUserIds}
              backlogPreview={backlogPreview}
              onStartDM={handleStartDM}
              onVote={backlogVote}
              onRemoveVote={backlogRemoveVote}
            />
          )}
        </div>
      ) : activeDMId ? (
        // DM view - reuse MessageArea with a synthetic channel object
        <div className="flex-1 flex relative">
          <MessageArea
            channel={
              {
                id: activeDMId,
                name: activeDMConvo?.otherUser?.name ?? 'Direct Message',
                slug: `dm-${activeDMId}`,
                description: 'Direct message',
                type: 'text' as const,
                isDefault: false,
                isArchived: false,
                sortOrder: 0,
                createdBy: null,
                createdAt: '',
                updatedAt: '',
                avatarUrl: activeDMConvo?.otherUser?.avatarUrl ?? null,
              } as CommunityChannel & { avatarUrl?: string | null }
            }
            messages={dmMessages as unknown as CommunityMessage[]}
            messagesLoading={dmMessagesLoading}
            hasMoreMessages={dmHasMore}
            typingUsers={[]}
            onSendMessage={handleSendDM}
            onReact={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onLoadMore={dmLoadMore}
            onTypingStart={() => {
              if (socket && activeDMId)
                socket.emit('dm:typing:start', { conversationId: activeDMId });
            }}
            onTypingStop={() => {
              if (socket && activeDMId)
                socket.emit('dm:typing:stop', { conversationId: activeDMId });
            }}
            onToggleMembers={() => {}}
            isAdmin={false}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-surface-0">
          <div className="text-center animate-slide-up">
            <h3 className="text-lg font-semibold text-text-primary">Direct Messages</h3>
            <p className="mt-1 text-sm text-text-tertiary">
              Select a conversation from the sidebar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
