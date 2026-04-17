import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  PanelRightClose,
  Send,
  Pencil,
  Trash2,
  Check,
  X,
  Radio,
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
  width: number;
  onResize: (width: number) => void;
}

// ── Resize Handle ──────────────────────────────────────────

function ResizeHandle({
  onResize,
  sidebarRef,
}: {
  onResize: (width: number) => void;
  sidebarRef: React.RefObject<HTMLDivElement>;
}) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const el = sidebarRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      onResize(rect.right - e.clientX);
    };

    const handleUp = () => setDragging(false);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onResize, sidebarRef]);

  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 transition-colors ${
        dragging ? 'bg-accent' : 'bg-transparent hover:bg-accent/40'
      }`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat sidebar"
      title="Drag to resize"
    />
  );
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
  width,
  onResize,
}: ProjectChatSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessageCount = useRef(messages.length);

  // Recent speakers — derived from last messages, unique by user
  const recentSpeakers = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; avatarUrl?: string | null }> = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 4; i--) {
      const u = messages[i]?.user;
      if (u && !seen.has(u.id)) {
        seen.add(u.id);
        out.push({ id: u.id, name: u.name, avatarUrl: u.avatarUrl });
      }
    }
    return out;
  }, [messages]);
  const overflowCount = Math.max(0, memberCount - recentSpeakers.length);

  // Pulse the top accent rail briefly when a new message arrives
  const [pulseTop, setPulseTop] = useState(false);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      setPulseTop(true);
      const t = setTimeout(() => setPulseTop(false), 1400);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

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
  }, [isLoading, messages.length]);

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
    <div
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className="relative shrink-0 rounded-2xl flex flex-col animate-slide-up overflow-hidden max-h-full
        bg-gradient-to-b from-surface-2/70 via-surface-2/40 to-surface-1/60
        border border-border-subtle
        shadow-[inset_0_1px_0_0_rgba(255,214,10,0.08),0_20px_50px_-20px_rgba(0,0,0,0.7)]
        backdrop-blur-glass"
    >
      {/* Top accent glow line */}
      <div
        aria-hidden="true"
        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent transition-opacity duration-700 pointer-events-none ${
          pulseTop ? 'opacity-100' : 'opacity-60'
        }`}
        style={{
          boxShadow: pulseTop ? '0 0 12px rgba(255,214,10,0.8)' : '0 0 6px rgba(255,214,10,0.3)',
        }}
      />

      {/* Resize handle */}
      <ResizeHandle onResize={onResize} sidebarRef={sidebarRef} />

      {/* Editorial Header */}
      <div className="relative px-4 pt-4 pb-3 border-b border-border-subtle/60 flex-shrink-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative">
              <div
                className="absolute inset-0 bg-accent/30 blur-md rounded-full"
                aria-hidden="true"
              />
              <Radio className="relative h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold tracking-[0.18em] uppercase text-text-primary leading-none">
                Project Feed
              </h2>
              <p className="text-[10px] text-text-tertiary/80 italic mt-0.5 truncate">
                where the team syncs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-text-tertiary hover:text-accent hover:bg-surface-3/60 transition-colors"
            title="Enter Focus Mode (hide chat)"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Presence rail */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {recentSpeakers.length > 0 ? (
              <div className="flex -space-x-1.5">
                {recentSpeakers.map((u, idx) => (
                  <div
                    key={u.id}
                    className="relative h-6 w-6 rounded-full ring-2 ring-surface-1 bg-surface-3 overflow-hidden flex items-center justify-center text-[9px] font-bold text-text-secondary"
                    title={u.name}
                    style={{ zIndex: recentSpeakers.length - idx }}
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
                    ) : (
                      <span>{getInitials(u.name)}</span>
                    )}
                    {idx === 0 && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-surface-1"
                        aria-label="active"
                      />
                    )}
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="h-6 w-6 rounded-full ring-2 ring-surface-1 bg-surface-3 flex items-center justify-center text-[9px] font-semibold text-text-tertiary">
                    +{overflowCount}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-text-tertiary/40" aria-hidden="true" />
                <span className="text-[10px] text-text-tertiary/60 italic">nobody yet</span>
              </div>
            )}
          </div>

          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary tabular-nums">
            {memberCount}{' '}
            <span className="text-text-tertiary/60 font-normal normal-case">
              member{memberCount === 1 ? '' : 's'}
            </span>
          </span>
        </div>

        {/* Live typing ticker */}
        {typingUsers.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-accent/90">
            <span className="flex gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full bg-accent animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
            <span className="italic truncate">
              {typingUsers.length === 1
                ? `${typingUsers[0].name} is typing…`
                : typingUsers.length === 2
                  ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`
                  : `${typingUsers.length} people are typing…`}
            </span>
          </div>
        )}
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
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="relative mb-4">
              <div
                className="absolute inset-0 bg-accent/25 blur-2xl rounded-full"
                aria-hidden="true"
              />
              <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-accent/25 via-accent/10 to-transparent border border-accent/30 shadow-[0_0_20px_rgba(255,214,10,0.15)]">
                <MessageCircle className="h-6 w-6 text-accent" />
              </div>
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-1">Quiet project. Yet.</h3>
            <p className="text-[11px] text-text-tertiary leading-relaxed mb-4 max-w-[240px]">
              {memberCount > 1
                ? 'Updates, decisions, quick questions — all live here alongside the board.'
                : 'Invite teammates and this becomes where the work talks back.'}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['share an update', 'ask what is blocking', 'link to a card'].map((hint) => (
                <span
                  key={hint}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-surface-3/40 border border-border-subtle/60 text-text-tertiary"
                >
                  {hint}
                </span>
              ))}
            </div>
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
