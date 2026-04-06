import { useState } from 'react';
import { Hash, ChevronDown, ChevronRight, ListTodo, Plus, Loader2 } from 'lucide-react';
import type { CommunityChannel, DirectConversation } from '@cc/shared';
import { UnreadBadge } from './UnreadBadge';
import { PresenceIndicator } from './PresenceIndicator';

interface ChannelSidebarProps {
  channels: CommunityChannel[];
  dmConversations: DirectConversation[];
  activeChannelId: string | null;
  activeDMId: string | null;
  activeView: 'channel' | 'dm' | 'backlog';
  unreadCounts: Record<string, number>;
  onlineUserIds: Set<string>;
  onSelectChannel: (channel: CommunityChannel) => void;
  onSelectDM: (conversation: DirectConversation) => void;
  onSelectBacklog: () => void;
  onCreateChannel?: () => void;
  isAdmin?: boolean;
  loading?: boolean;
}

export function ChannelSidebar({
  channels,
  dmConversations,
  activeChannelId,
  activeDMId,
  activeView,
  unreadCounts,
  onlineUserIds,
  onSelectChannel,
  onSelectDM,
  onSelectBacklog,
  onCreateChannel,
  isAdmin = false,
  loading = false,
}: ChannelSidebarProps) {
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  if (loading) {
    return (
      <aside className="w-60 flex-shrink-0 bg-surface-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 text-text-tertiary animate-spin" />
      </aside>
    );
  }

  return (
    <aside
      className="w-60 flex-shrink-0 bg-surface-1 flex flex-col overflow-hidden shadow-[1px_0_12px_rgba(0,0,0,0.4)]"
      style={{ background: 'linear-gradient(180deg, #141416 0%, #111113 100%)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3.5"
        style={{
          background: 'linear-gradient(180deg, rgba(255,214,10,0.06) 0%, transparent 100%)',
        }}
      >
        <h2 className="text-sm font-bold tracking-wide bg-gradient-to-r from-accent to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,214,10,0.2)]">
          The Brew
        </h2>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-1 scrollbar-thin scrollbar-thumb-surface-3">
        {/* Channels section */}
        <div>
          <button
            type="button"
            onClick={() => setChannelsOpen(!channelsOpen)}
            className="flex items-center gap-1 w-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent/60 hover:text-accent transition-colors"
          >
            {channelsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Channels</span>
            {isAdmin && onCreateChannel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateChannel();
                }}
                className="ml-auto p-0.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-accent transition-all duration-200 ease-spring hover:scale-110 active:scale-95"
                title="Create channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </button>

          {channelsOpen && (
            <div className="mt-0.5 space-y-px">
              {channels.map((channel, index) => {
                const isActive = activeView === 'channel' && activeChannelId === channel.id;
                const unread = unreadCounts[channel.id] || 0;

                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onSelectChannel(channel)}
                    className={`animate-slide-up flex items-center gap-2 w-full px-3 py-1.5 rounded-lg mx-1 text-sm transition-all duration-200 ease-spring ${
                      isActive
                        ? 'bg-accent/10 text-text-primary shadow-[0_0_12px_rgba(255,214,10,0.08)]'
                        : unread > 0
                          ? 'text-text-primary hover:bg-white/[0.03] font-medium'
                          : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
                    }`}
                    style={{ maxWidth: 'calc(100% - 0.5rem)', animationDelay: `${index * 30}ms` }}
                  >
                    <Hash className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-accent' : ''}`} />
                    <span className="truncate">{channel.name}</span>
                    {unread > 0 && (
                      <span className="ml-auto">
                        <UnreadBadge count={unread} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Direct Messages section */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setDmsOpen(!dmsOpen)}
            className="flex items-center gap-1 w-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent/60 hover:text-accent transition-colors"
          >
            {dmsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>Direct Messages</span>
          </button>

          {dmsOpen && (
            <div className="mt-0.5 space-y-px">
              {dmConversations.length === 0 ? (
                <p className="px-4 py-2 text-xs text-text-tertiary italic">No conversations yet</p>
              ) : (
                dmConversations.map((convo, index) => {
                  const isActive = activeView === 'dm' && activeDMId === convo.conversationId;
                  const isOnline = onlineUserIds.has(convo.otherUser.id);

                  return (
                    <button
                      key={convo.conversationId}
                      type="button"
                      onClick={() => onSelectDM(convo)}
                      className={`animate-slide-up flex items-center gap-2 w-full px-3 py-1.5 rounded-lg mx-1 text-sm transition-all duration-200 ease-spring ${
                        isActive
                          ? 'bg-accent/10 text-text-primary shadow-[0_0_12px_rgba(255,214,10,0.08)]'
                          : convo.unreadCount > 0
                            ? 'text-text-primary hover:bg-white/[0.03] font-medium'
                            : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
                      }`}
                      style={{ maxWidth: 'calc(100% - 0.5rem)', animationDelay: `${index * 30}ms` }}
                    >
                      <span className="relative flex-shrink-0">
                        {convo.otherUser.avatarUrl ? (
                          <img
                            src={convo.otherUser.avatarUrl}
                            alt=""
                            className={`h-6 w-6 rounded-full object-cover transition-shadow duration-200 ${isOnline ? 'shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'opacity-70'}`}
                          />
                        ) : (
                          <div
                            className={`h-6 w-6 rounded-full bg-gradient-to-br from-accent/25 to-amber-600/25 flex items-center justify-center transition-shadow duration-200 ${isOnline ? 'shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'opacity-70'}`}
                          >
                            <span className="text-[8px] font-semibold text-accent">
                              {convo.otherUser.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceIndicator isOnline={isOnline} size="sm" />
                        </span>
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <span className="block truncate">{convo.otherUser.name}</span>
                        {convo.lastMessage && (
                          <span className="block truncate text-[10px] text-text-tertiary">
                            {convo.lastMessage.content}
                          </span>
                        )}
                      </div>
                      {convo.unreadCount > 0 && (
                        <span className="ml-auto flex-shrink-0">
                          <UnreadBadge count={convo.unreadCount} />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Backlog link */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onSelectBacklog}
            className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg mx-1 text-sm transition-all duration-200 ease-spring ${
              activeView === 'backlog'
                ? 'bg-accent/10 text-text-primary shadow-[0_0_12px_rgba(255,214,10,0.08)]'
                : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
            }`}
            style={{ maxWidth: 'calc(100% - 0.5rem)' }}
          >
            <ListTodo
              className={`h-4 w-4 flex-shrink-0 ${activeView === 'backlog' ? 'text-accent' : ''}`}
            />
            <span>Backlog</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
