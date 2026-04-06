import { useState, useMemo } from 'react';
import { Smile, Pencil, Trash2 } from 'lucide-react';
import type { CommunityMessage as CommunityMessageType, ReactionGroup } from '@cc/shared';
import { useAuth } from '../../context/AuthContext';
import { ImageAttachment } from './ImageAttachment';
import { LinkPreview } from './LinkPreview';

interface CommunityMessageProps {
  message: CommunityMessageType;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  isAdmin?: boolean;
}

const QUICK_REACTIONS = [
  '\u{1F44D}',
  '\u{2764}\u{FE0F}',
  '\u{1F389}',
  '\u{1F440}',
  '\u{1F680}',
  '\u{1F4AF}',
];

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function CommunityMessage({
  message,
  onReact,
  onEdit,
  onDelete,
  isAdmin = false,
}: CommunityMessageProps) {
  const { user } = useAuth();
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const isOwnMessage = user?.id === message.userId;
  const canEdit = isOwnMessage;
  const canDelete = isOwnMessage || isAdmin;

  const attachments = useMemo(() => message.attachments ?? [], [message.attachments]);
  const reactions = message.reactions ?? [];

  const imageAttachments = useMemo(
    () => attachments.filter((a) => a.type === 'image'),
    [attachments],
  );

  const linkPreviews = useMemo(
    () => attachments.filter((a) => a.type === 'link_preview'),
    [attachments],
  );

  if (message.type === 'system') {
    return (
      <div className="flex justify-center py-2 px-4">
        <span className="text-xs text-text-tertiary italic">{message.content}</span>
      </div>
    );
  }

  const handleEditSave = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    }
    if (e.key === 'Escape') {
      setEditContent(message.content);
      setIsEditing(false);
    }
  };

  return (
    <div
      className="group relative flex gap-3 px-4 py-1.5 hover:bg-surface-1/40 transition-all duration-200 ease-spring rounded-lg"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowReactionPicker(false);
      }}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        {message.user.avatarUrl ? (
          <img
            src={message.user.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover shadow-[0_0_8px_rgba(255,214,10,0.08)]"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent/25 to-amber-600/25 flex items-center justify-center shadow-[0_0_10px_rgba(255,214,10,0.1)]">
            <span className="text-xs font-semibold text-accent">
              {getInitials(message.user.name)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-text-primary hover:underline cursor-pointer">
            {message.user.name}
          </span>
          <span className="text-[11px] text-text-tertiary/70">{formatTime(message.createdAt)}</span>
          {message.isEdited && (
            <span className="text-[10px] text-text-tertiary italic">(edited)</span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full rounded-lg bg-surface-2/50 backdrop-blur-sm px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.08)] resize-none transition-all duration-200"
              rows={2}
              autoFocus
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={handleEditSave}
                className="text-xs text-accent hover:underline"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditContent(message.content);
                  setIsEditing(false);
                }}
                className="text-xs text-text-tertiary hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Image attachments */}
        {imageAttachments.map((att) => (
          <ImageAttachment key={att.id} url={att.url} fileName={att.fileName} />
        ))}

        {/* Link previews */}
        {linkPreviews.map((att) =>
          att.metadata ? <LinkPreview key={att.id} url={att.url} metadata={att.metadata} /> : null,
        )}

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {reactions.map((reaction: ReactionGroup) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message.id, reaction.emoji)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs backdrop-blur-sm transition-all duration-200 ease-spring hover:scale-[1.05] active:scale-[0.95] animate-scale-in ${
                  reaction.hasReacted
                    ? 'bg-accent/15 text-accent shadow-[0_0_6px_rgba(255,214,10,0.15)]'
                    : 'bg-surface-2/50 text-text-secondary hover:bg-surface-2/70'
                }`}
              >
                <span>{reaction.emoji}</span>
                <span className="font-medium">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !isEditing && (
        <div className="absolute -top-3 right-4 flex items-center gap-0.5 rounded-lg bg-surface-3 shadow-dark-lg p-0.5 animate-scale-in">
          <button
            type="button"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            className="p-1.5 rounded-md hover:bg-surface-4/50 text-text-tertiary hover:text-accent transition-all duration-200 ease-spring hover:scale-110"
            title="Add reaction"
          >
            <Smile className="h-4 w-4" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(true);
                setShowActions(false);
              }}
              className="p-1.5 rounded-md hover:bg-surface-4/50 text-text-tertiary hover:text-text-primary transition-all duration-200 ease-spring hover:scale-110"
              title="Edit message"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="p-1.5 rounded-md hover:bg-red-500/20 text-text-tertiary hover:text-red-400 transition-all duration-200 ease-spring hover:scale-110"
              title="Delete message"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Quick reaction picker */}
      {showReactionPicker && (
        <div className="absolute -top-10 right-4 flex items-center gap-0.5 rounded-xl bg-surface-3 shadow-dark-lg p-1 animate-scale-in">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(message.id, emoji);
                setShowReactionPicker(false);
              }}
              className="p-1 rounded-md hover:bg-surface-4/50 text-base transition-all duration-200 ease-spring hover:scale-125 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
