import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity } from 'lucide-react';
import type { ProjectActivity } from '@cc/shared';
import { api } from '../../lib/api';

interface ActivityLogProps {
  projectId: string;
  cardId?: string;
  limit?: number;
}

const PAGE_SIZE = 20;

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function humaniseAction(activity: ProjectActivity): string {
  const { action, metadata } = activity;
  const entityName = (metadata?.title ?? metadata?.name ?? '') as string;
  switch (action) {
    case 'card.created':
      return `created card${entityName ? ` "${entityName}"` : ''}`;
    case 'card.updated':
      return `updated card${entityName ? ` "${entityName}"` : ''}`;
    case 'card.deleted':
      return `deleted card${entityName ? ` "${entityName}"` : ''}`;
    case 'card.moved':
      return `moved card${entityName ? ` "${entityName}"` : ''}`;
    case 'comment.created':
      return 'added a comment';
    case 'comment.deleted':
      return 'deleted a comment';
    case 'attachment.uploaded':
      return `uploaded ${entityName || 'a file'}`;
    case 'attachment.deleted':
      return `removed attachment`;
    case 'label.added':
      return `added label${entityName ? ` "${entityName}"` : ''}`;
    case 'label.removed':
      return `removed label${entityName ? ` "${entityName}"` : ''}`;
    case 'member.added':
      return `added a member`;
    case 'member.removed':
      return `removed a member`;
    case 'project.updated':
      return 'updated project details';
    case 'column.created':
      return `created column${entityName ? ` "${entityName}"` : ''}`;
    case 'column.deleted':
      return `deleted column${entityName ? ` "${entityName}"` : ''}`;
    default:
      return action.replace(/\./g, ' ');
  }
}

export function ActivityLog({ projectId, cardId, limit }: ActivityLogProps) {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pageSize = limit ?? PAGE_SIZE;

  const fetchActivities = useCallback(
    async (currentOffset: number, append = false) => {
      setIsLoading(true);
      setError(null);
      const url = cardId
        ? `/projects/${projectId}/cards/${cardId}/activities`
        : `/projects/${projectId}/activities`;
      try {
        const { data } = await api.get(url, {
          params: { limit: pageSize, offset: currentOffset },
        });
        const items: ProjectActivity[] = data.data ?? [];
        if (append) {
          setActivities((prev) => [...prev, ...items]);
        } else {
          setActivities(items);
        }
        setHasMore(items.length === pageSize);
      } catch {
        setError('Failed to load activity');
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, cardId, pageSize],
  );

  useEffect(() => {
    setOffset(0);
    setActivities([]);
    void fetchActivities(0, false);
  }, [fetchActivities]);

  const loadMore = () => {
    const nextOffset = offset + pageSize;
    setOffset(nextOffset);
    void fetchActivities(nextOffset, true);
  };

  // Infinite scroll: load more when list bottom is near
  useEffect(() => {
    const el = listRef.current;
    if (!el || !hasMore) return;
    const handler = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
        loadMore();
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, offset]);

  if (isLoading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
        <div className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
        Loading activity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-400 text-xs">{error}</div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-surface-3/50 p-3 mb-3">
          <Activity className="h-6 w-6 text-text-tertiary" />
        </div>
        <p className="text-sm text-text-tertiary">No activity yet.</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto pr-1">
      <div className="relative pl-5 space-y-0">
        {/* Vertical timeline line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border-subtle" />

        {activities.map((activity, i) => (
          <div key={activity.id} className="relative flex gap-3 pb-4">
            {/* Timeline dot */}
            <div className="absolute left-[-12px] top-1 h-5 w-5 flex items-center justify-center">
              {activity.userAvatar ? (
                <img
                  src={activity.userAvatar}
                  alt={activity.userName}
                  className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-accent/40 to-amber-600/40 flex items-center justify-center text-[8px] font-bold text-accent ring-1 ring-accent/20">
                  {getInitials(activity.userName)}
                </div>
              )}
            </div>

            {/* Content */}
            <div
              className={`flex-1 min-w-0 rounded-lg px-3 py-2 transition-colors ${
                i % 2 === 0 ? 'bg-surface-2/30' : 'bg-transparent'
              }`}
            >
              <p className="text-xs text-text-primary">
                <span className="font-semibold text-text-secondary">{activity.userName}</span>{' '}
                {humaniseAction(activity)}
              </p>
              <p className="text-[10px] text-text-tertiary mt-0.5">{timeAgo(activity.createdAt)}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-center py-3">
            <div className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && hasMore && !limit && (
          <button
            type="button"
            onClick={loadMore}
            className="w-full text-center text-xs text-text-tertiary hover:text-accent py-2 transition-colors"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
