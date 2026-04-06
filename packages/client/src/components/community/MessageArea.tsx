import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Users, ChevronDown, Loader2 } from 'lucide-react';
import type { CommunityChannel, CommunityMessage as CommunityMessageType } from '@cc/shared';
import { CommunityMessage } from './CommunityMessage';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';

interface MessageAreaProps {
  channel: CommunityChannel | null;
  messages: CommunityMessageType[];
  messagesLoading: boolean;
  hasMoreMessages: boolean;
  typingUsers: Array<{ userId: string; name: string }>;
  onSendMessage: (content: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onLoadMore: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onToggleMembers: () => void;
  isAdmin?: boolean;
}

export function MessageArea({
  channel,
  messages,
  messagesLoading,
  hasMoreMessages,
  typingUsers,
  onSendMessage,
  onReact,
  onEdit,
  onDelete,
  onLoadMore,
  onTypingStart,
  onTypingStop,
  onToggleMembers,
  isAdmin = false,
}: MessageAreaProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Messages come from the hook in newest-first order; reverse for display
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll when new messages arrive and user is near bottom
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom('smooth');
    }
  }, [messages.length, isNearBottom, scrollToBottom]);

  // Scroll to bottom on channel switch
  useEffect(() => {
    if (channel) {
      setTimeout(() => scrollToBottom('instant'), 50);
    }
  }, [channel, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 100;
    setIsNearBottom(nearBottom);
    setShowJumpToBottom(!nearBottom);

    // Load more when scrolled to top
    if (el.scrollTop < 50 && hasMoreMessages && !messagesLoading) {
      onLoadMore();
    }
  }, [hasMoreMessages, messagesLoading, onLoadMore]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-0">
        <div className="text-center animate-slide-up">
          <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-accent/20 to-amber-600/20 flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(255,214,10,0.1)]">
            <Users className="h-10 w-10 text-accent drop-shadow-[0_0_6px_rgba(255,214,10,0.3)]" />
          </div>
          <h3 className="text-lg font-semibold bg-gradient-to-r from-accent to-amber-500 bg-clip-text text-transparent">
            Welcome to Community
          </h3>
          <p className="mt-1.5 text-sm text-text-tertiary">Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0"
      style={{
        background:
          'radial-gradient(ellipse at center 0%, rgba(255,255,255,0.015) 0%, transparent 60%), #0a0a0b',
      }}
    >
      {/* Channel header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 shadow-dark-sm"
        style={{
          background:
            'linear-gradient(90deg, rgba(17,17,19,0.9) 0%, rgba(17,17,19,0.7) 50%, rgba(17,17,19,0.9) 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-1.5">
            {channel.description === 'Direct message' &&
            (channel as CommunityChannel & { avatarUrl?: string | null }).avatarUrl ? (
              <img
                src={
                  (channel as CommunityChannel & { avatarUrl?: string | null }).avatarUrl ??
                  undefined
                }
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : channel.description === 'Direct message' ? (
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-accent/25 to-amber-600/25 flex items-center justify-center">
                <span className="text-[8px] font-semibold text-accent">
                  {channel.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              </div>
            ) : (
              <span className="text-accent">#</span>
            )}
            <span className="truncate">{channel.name}</span>
          </h2>
          {channel.description && channel.description !== 'Direct message' && (
            <p className="text-xs text-text-tertiary truncate mt-0.5">{channel.description}</p>
          )}
          {channel.description === 'Direct message' && (
            <p className="text-xs text-text-tertiary truncate mt-0.5">Direct message</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {channel.memberCount !== undefined && (
            <span className="text-xs text-text-tertiary flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {channel.memberCount}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleMembers}
            className="p-1.5 rounded-lg hover:bg-surface-2/50 text-text-secondary hover:text-text-primary transition-all duration-200 ease-spring hover:shadow-[0_0_12px_rgba(255,214,10,0.15)]"
            title="Toggle member panel"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-3 shadow-[inset_0_8px_12px_-8px_rgba(0,0,0,0.3)]"
      >
        {/* Load more indicator */}
        {messagesLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 text-text-tertiary animate-spin" />
          </div>
        )}

        {hasMoreMessages && !messagesLoading && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              onClick={onLoadMore}
              className="text-xs text-accent hover:text-amber-400 px-4 py-1.5 rounded-full bg-surface-2/50 backdrop-blur-sm transition-all duration-200 hover:shadow-[0_0_8px_rgba(255,214,10,0.08)]"
            >
              Load older messages
            </button>
          </div>
        )}

        {/* Message list */}
        <div className="py-2">
          {displayMessages.length === 0 && !messagesLoading ? (
            <div className="flex flex-col items-center justify-center py-16 animate-slide-up">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-accent/20 to-amber-600/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(255,214,10,0.1)]">
                <span className="text-3xl text-accent drop-shadow-[0_0_6px_rgba(255,214,10,0.3)]">
                  #
                </span>
              </div>
              <h3 className="text-base font-semibold bg-gradient-to-r from-accent to-amber-500 bg-clip-text text-transparent">
                Welcome to #{channel.name}
              </h3>
              <p className="mt-1.5 text-sm text-text-tertiary">
                Start the conversation — this is where it all begins.
              </p>
            </div>
          ) : (
            displayMessages.map((msg) => (
              <CommunityMessage
                key={msg.id}
                message={msg}
                onReact={onReact}
                onEdit={onEdit}
                onDelete={onDelete}
                isAdmin={isAdmin}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Typing indicator */}
      <TypingIndicator users={typingUsers} />

      {/* Jump to bottom */}
      {showJumpToBottom && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="flex items-center gap-1 rounded-full bg-surface-3/80 backdrop-blur-sm px-3 py-1.5 text-xs text-text-secondary hover:text-accent shadow-dark-lg transition-all duration-200 hover:shadow-[0_0_12px_rgba(255,214,10,0.1)] hover:scale-105 active:scale-95 animate-scale-in"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Jump to bottom
          </button>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        channelName={channel.name}
        onSend={onSendMessage}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </div>
  );
}
