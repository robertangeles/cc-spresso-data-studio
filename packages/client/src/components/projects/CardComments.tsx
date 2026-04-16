import { useState, useEffect } from 'react';
import { MessageSquare, Send, Edit3, Trash2 } from 'lucide-react';
import type { CardComment } from '@cc/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface CardCommentsProps {
  cardId: string;
  projectId: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CardComments({ cardId, projectId }: CardCommentsProps) {
  const { user } = useAuth();
  const base = `/projects/${projectId}/cards/${cardId}/comments`;

  const [comments, setComments] = useState<CardComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api
      .get(base)
      .then(({ data }) => {
        if (!cancelled) setComments(data.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const handlePost = async () => {
    const content = newComment.trim();
    if (!content) return;
    setIsPosting(true);
    try {
      const { data } = await api.post(base, { content });
      setComments((prev) => [...prev, data.data]);
      setNewComment('');
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  const handleStartEdit = (comment: CardComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (commentId: string) => {
    const content = editContent.trim();
    if (!content) return;
    const { data } = await api.put(`${base}/${commentId}`, { content });
    setComments((prev) => prev.map((c) => (c.id === commentId ? data.data : c)));
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (commentId: string) => {
    await api.delete(`${base}/${commentId}`);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
        <div className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
        Loading comments...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-surface-3/50 p-3 mb-3">
              <MessageSquare className="h-6 w-6 text-text-tertiary" />
            </div>
            <p className="text-sm text-text-tertiary">No comments yet. Start the conversation.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isOwn = user?.id === comment.userId;
            const isEditing = editingId === comment.id;

            return (
              <div
                key={comment.id}
                className="group rounded-lg bg-surface-2/50 backdrop-blur-sm border border-white/5 p-3 transition-all hover:border-white/10"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-secondary">
                      {isOwn ? 'You' : (comment.userName ?? 'Unknown')}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {timeAgo(comment.createdAt)}
                    </span>
                  </div>
                  {isOwn && !isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(comment)}
                        className="rounded p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        className="rounded p-1 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none transition-all"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="rounded-lg px-3 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={!editContent.trim()}
                        className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1 text-xs font-medium text-surface-0 disabled:opacity-50 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all duration-200"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{comment.content}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add comment form */}
      <div className="border-t border-border-subtle pt-3">
        <div className="relative">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Write a comment... (Ctrl+Enter to post)"
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none transition-all"
          />
          <button
            type="button"
            onClick={handlePost}
            disabled={!newComment.trim() || isPosting}
            className="absolute bottom-2.5 right-2.5 rounded-lg p-1.5 text-accent disabled:text-text-tertiary disabled:opacity-50 hover:bg-accent/10 transition-colors"
            title="Post comment"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
