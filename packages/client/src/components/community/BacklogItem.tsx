import { ChevronUp, ChevronDown } from 'lucide-react';
import type { BacklogItem as BacklogItemType } from '@cc/shared';

interface BacklogItemProps {
  item: BacklogItemType;
  onVote: (itemId: string, voteType: 'up' | 'down') => void;
  onRemoveVote: (itemId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-400',
  in_progress: 'bg-gradient-to-r from-accent/20 to-amber-600/20 text-amber-400',
  shipped: 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 text-emerald-400',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  shipped: 'Shipped',
};

export function BacklogItemCard({ item, onVote, onRemoveVote }: BacklogItemProps) {
  const handleUpvote = () => {
    if (item.userVote === 'up') {
      onRemoveVote(item.id);
    } else {
      onVote(item.id, 'up');
    }
  };

  const handleDownvote = () => {
    if (item.userVote === 'down') {
      onRemoveVote(item.id);
    } else {
      onVote(item.id, 'down');
    }
  };

  return (
    <div className="rounded-xl bg-surface-2 p-3 shadow-dark-sm hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_15px_rgba(255,214,10,0.06)] transition-all duration-200 ease-spring">
      <div className="flex items-start gap-3">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleUpvote}
            className={`p-0.5 rounded transition-all duration-200 ease-spring active:scale-90 ${
              item.userVote === 'up'
                ? 'text-emerald-400 bg-emerald-500/15 shadow-[0_0_8px_rgba(52,211,153,0.2)]'
                : 'text-text-tertiary hover:text-emerald-400 hover:bg-emerald-500/10'
            }`}
            aria-label="Upvote"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <span
            className={`text-sm font-bold tabular-nums ${
              item.score > 0
                ? 'text-accent'
                : item.score < 0
                  ? 'text-red-400'
                  : 'text-text-tertiary'
            }`}
          >
            {item.score}
          </span>
          <button
            type="button"
            onClick={handleDownvote}
            className={`p-0.5 rounded transition-all duration-200 ease-spring active:scale-90 ${
              item.userVote === 'down'
                ? 'text-red-400 bg-red-500/15 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                : 'text-text-tertiary hover:text-red-400 hover:bg-red-500/10'
            }`}
            aria-label="Downvote"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-text-primary">{item.title}</h4>
          {item.description && (
            <p className="mt-0.5 text-xs text-text-tertiary line-clamp-3">{item.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                STATUS_COLORS[item.status] || 'bg-surface-3 text-text-tertiary'
              }`}
            >
              {STATUS_LABELS[item.status] || item.status}
            </span>
            {item.category && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-surface-3/50 text-text-secondary">
                {item.category}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
