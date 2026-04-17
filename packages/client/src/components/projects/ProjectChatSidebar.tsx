import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  PanelRightClose,
  Send,
  Pencil,
  Trash2,
  Check,
  X,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TypingIndicator } from '../community/TypingIndicator';
import type { ProjectChatMessage } from '@cc/shared';

// ── Quick Reactions ─────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '❤️', '🎉', '👀', '🚀', '💯'];

// ── Helpers ─────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Chat Message ────────────────────────────────────────────

interface ChatMessageProps {
  message: ProjectChatMessage;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
}

function ChatMessage({ message, onReact, onEdit, onDelete }: ChatMessageProps) {
  const { user } = useAuth();
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const isOwn = user?.id === message.userId;

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit(message.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div
      className="group relative px-3 py-2 hover:bg-surface-3/30 transition-colors rounded-lg"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowReactions(false);
      }}
    >
      <div className="flex gap-2.5">
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-secondary flex-shrink-0 mt-0.5 overflow-hidden">
          {message.user.avatarUrl ? (
            <img
              src={message.user.avatarUrl}
              alt={message.user.name}
              className="h-full w-full object-cover"
            />
          ) : (
            getInitials(message.user.name)
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + time */}
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-text-primary">{message.user.name}</span>
            <span className="text-[10px] text-text-tertiary">{formatTime(message.createdAt)}</span>
            {message.isEdited && (
              <span className="text-[9px] text-text-tertiary italic">(edited)</span>
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="w-full rounded-lg border border-accent/40 bg-surface-2/50 px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none"
                rows={2}
                autoFocus
              />
              <div className="flex gap-1 mt-1 justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="p-1 rounded text-accent hover:bg-accent/10 transition-colors"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words mt-0.5">
              {message.content}
            </p>
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(message.id, r.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition-all ${
                    r.hasReacted
                      ? 'bg-accent/15 border border-accent/30 text-accent'
                      : 'bg-surface-3/60 border border-white/5 text-text-tertiary hover:border-accent/20'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {showActions && !isEditing && (
        <div className="absolute -top-2 right-2 flex items-center gap-0.5 bg-surface-1 border border-border-subtle rounded-lg shadow-dark-lg px-1 py-0.5 animate-scale-in">
          {/* Reaction picker trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactions((v) => !v)}
              className="p-1 rounded text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors text-[11px]"
              title="React"
            >
              😊
            </button>
            {showReactions && (
              <div className="absolute bottom-full right-0 mb-1 flex gap-0.5 bg-surface-1 border border-border-subtle rounded-lg shadow-dark-lg p-1 animate-scale-in">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(message.id, emoji);
                      setShowReactions(false);
                    }}
                    className="p-1 rounded hover:bg-surface-3 transition-colors text-sm"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isOwn && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditContent(message.content);
                  setIsEditing(true);
                }}
                className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat Input ──────────────────────────────────────────────

interface ChatInputProps {
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled?: boolean;
}

function ChatInput({ onSend, onTypingStart, onTypingStop, disabled }: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isTypingRef = useRef(false);

  const handleInput = (val: string) => {
    setContent(val);

    // Auto-grow
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    // Typing indicator
    if (!isTypingRef.current && val.trim()) {
      isTypingRef.current = true;
      onTypingStart();
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingStop();
      }
    }, 3000);
  };

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    onSend(trimmed);
    setContent('');

    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop();
    }

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Refocus
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="flex items-end gap-2 px-3 py-2.5 border-t border-border-subtle bg-surface-2/30">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        maxLength={4000}
        className="flex-1 rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/40 focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none transition-all"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !content.trim()}
        className="p-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        title="Send (Enter)"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main Sidebar ────────────────────────────────────────────

interface ProjectChatSidebarProps {
  messages: ProjectChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  typingUsers: Array<{ userId: string; name: string }>;
  memberCount: number;
  onSend: (content: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onLoadMore: () => void;
  onClose: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
}

export function ProjectChatSidebar({
  messages,
  isLoading,
  hasMore,
  typingUsers,
  memberCount,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onLoadMore,
  onClose,
  onTypingStart,
  onTypingStop,
}: ProjectChatSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessageCount = useRef(messages.length);

  // Auto-scroll on new messages when near bottom
  useEffect(() => {
    if (messages.length > prevMessageCount.current && isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isNearBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [isLoading]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Check if near bottom
    const threshold = 100;
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);

    // Load more when scrolled to top
    if (el.scrollTop < 50 && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  return (
    <div className="w-80 shrink-0 rounded-xl border border-border-subtle bg-surface-2/40 backdrop-blur-glass flex flex-col animate-slide-up overflow-hidden max-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Project Chat
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
            <Users className="h-3 w-3" />
            {memberCount}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
            title="Close chat"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 py-2"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="p-3 rounded-full bg-accent/10 mb-3">
              <MessageCircle className="h-6 w-6 text-accent" />
            </div>
            <p className="text-sm font-medium text-text-secondary">No messages yet</p>
            <p className="text-xs text-text-tertiary mt-1">Start the conversation with your team</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full py-2 text-[10px] text-accent hover:underline"
              >
                Load older messages
              </button>
            )}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onReact={onReact}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && <TypingIndicator users={typingUsers} />}

      {/* Input */}
      <ChatInput onSend={onSend} onTypingStart={onTypingStart} onTypingStop={onTypingStop} />
    </div>
  );
}
