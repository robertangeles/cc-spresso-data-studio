import { useState } from 'react';
import { ChevronUp, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import type { BacklogItem as BacklogItemType } from '@cc/shared';

interface BacklogItemProps {
  item: BacklogItemType;
  onVote: (itemId: string, voteType: 'up' | 'down') => void;
  onRemoveVote: (itemId: string) => void;
  isDragging?: boolean;
  isAdmin?: boolean;
  onUpdate?: (
    itemId: string,
    updates: { title?: string; description?: string; category?: string },
  ) => Promise<unknown>;
  onDelete?: (itemId: string) => Promise<unknown>;
  onClick?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  content: 'bg-blue-500',
  platform: 'bg-purple-500',
  ai: 'bg-emerald-500',
  ux: 'bg-amber-500',
  billing: 'bg-red-500',
  integration: 'bg-cyan-500',
  community: 'bg-pink-500',
};

function getCategoryColor(category: string): string {
  const lower = category.toLowerCase();
  return CATEGORY_COLORS[lower] ?? 'bg-text-tertiary';
}

export function BacklogItemCard({
  item,
  onVote,
  onRemoveVote,
  isDragging = false,
  isAdmin = false,
  onUpdate,
  onDelete,
  onClick,
}: BacklogItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.userVote === 'up') {
      onRemoveVote(item.id);
    } else {
      onVote(item.id, 'up');
    }
  };

  const handleSave = async () => {
    if (!editTitle.trim() || !onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate(item.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    await onDelete(item.id);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg bg-surface-2 border border-border-subtle p-3 space-y-2">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded border border-border-default bg-surface-3 px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={3}
          placeholder="Add a description..."
          className="w-full rounded border border-border-default bg-surface-3 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none resize-none"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!editTitle.trim() || isSaving}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-surface-0 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditTitle(item.title);
              setEditDescription(item.description ?? '');
              setIsEditing(false);
            }}
            className="rounded px-3 py-1 text-xs text-text-tertiary hover:bg-surface-3"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg bg-surface-2 border border-border-subtle p-3 cursor-pointer
        hover:border-border-hover hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-all duration-150
        ${isDragging ? 'opacity-40 rotate-2 scale-105 shadow-[0_8px_30px_rgba(0,0,0,0.5)]' : ''}`}
    >
      {/* Category label chip */}
      {item.category && (
        <div className="mb-2">
          <span
            className={`inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold text-white ${getCategoryColor(item.category)}`}
          >
            {item.category}
          </span>
        </div>
      )}

      {/* Title */}
      <h4 className="text-sm font-medium text-text-primary leading-snug">{item.title}</h4>

      {/* Description preview */}
      {item.description && (
        <p className="mt-1 text-xs text-text-tertiary line-clamp-2">{item.description}</p>
      )}

      {/* Footer: votes + admin actions */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border-subtle/50">
        <div className="flex items-center gap-2">
          {/* Upvote button */}
          <button
            type="button"
            onClick={handleUpvote}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-all ${
              item.userVote === 'up'
                ? 'bg-accent/15 text-accent'
                : 'text-text-tertiary hover:bg-surface-3 hover:text-text-secondary'
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
            <span className="font-semibold tabular-nums">{item.score}</span>
          </button>

          {/* Description indicator */}
          {item.description && (
            <span className="text-text-tertiary" title="Has description">
              <MessageSquare className="h-3 w-3" />
            </span>
          )}
        </div>

        {/* Admin actions */}
        {isAdmin && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="rounded p-1 text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors"
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded p-1 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
