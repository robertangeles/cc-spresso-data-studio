import { Copy, Trash2, RefreshCw, ImageIcon, Link2 } from 'lucide-react';
import type { ContentItem, Channel } from '../../hooks/useContent';

interface ContentCardProps {
  item: ContentItem;
  channel?: Channel;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRemix: () => void;
  platformColor: string;
  index: number;
  sourceTitle?: string;
}

const statusConfig: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: 'Draft', dot: 'bg-text-tertiary', bg: 'bg-surface-3/80 text-text-secondary' },
  ready: { label: 'Ready', dot: 'bg-blue-400', bg: 'bg-blue-500/10 text-blue-400' },
  published: {
    label: 'Published',
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/10 text-emerald-400',
  },
  archived: { label: 'Archived', dot: 'bg-amber-400', bg: 'bg-amber-500/10 text-amber-400' },
};

export function ContentCard({
  item,
  channel,
  isSelected,
  onToggleSelect,
  onSelect,
  onCopy,
  onDelete,
  onRemix,
  platformColor,
  index,
  sourceTitle,
}: ContentCardProps) {
  const status = statusConfig[item.status] ?? statusConfig.draft;
  const hasImage = !!item.imageUrl;

  return (
    <div className="group relative animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
      {/* Selection checkbox — always visible when selected, hover-visible otherwise */}
      <div
        className={`absolute -left-1 -top-1 z-10 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <label
          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg backdrop-blur-sm border shadow-lg transition-colors
          ${
            isSelected
              ? 'bg-accent/20 border-accent/40'
              : 'bg-surface-1/90 border-border-subtle hover:border-accent'
          }`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className="h-3.5 w-3.5 rounded border-border-default bg-surface-3 text-accent accent-accent cursor-pointer"
          />
        </label>
      </div>

      {/* Card body */}
      <div
        className={`relative overflow-hidden rounded-xl border transition-all duration-300 ease-spring cursor-pointer
          ${
            isSelected
              ? 'border-accent/40 bg-accent/[0.03] shadow-[0_0_20px_rgba(255,214,10,0.08)]'
              : 'border-border-subtle bg-surface-2/70 hover:border-border-hover hover:shadow-glow hover:-translate-y-0.5'
          }`}
        onClick={onSelect}
      >
        {/* Platform accent stripe */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
          style={{ background: platformColor }}
        />

        {/* Image thumbnail */}
        {hasImage && (
          <div className="relative h-28 w-full overflow-hidden bg-surface-1">
            <img
              src={item.imageUrl!}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-2/90 to-transparent" />
          </div>
        )}

        <div className="p-4 pl-5">
          {/* Header row: status + channel icon + image indicator */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {channel && (
                <span className="text-sm" title={channel.name}>
                  {channel.icon}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase ${status.bg}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            {hasImage && <ImageIcon className="h-3.5 w-3.5 text-text-tertiary" />}
          </div>

          {/* Title */}
          <h4 className="font-semibold text-sm text-text-primary line-clamp-2 leading-snug mb-1.5 group-hover:text-accent/90 transition-colors duration-200">
            {item.title}
          </h4>

          {/* Lineage badge */}
          {sourceTitle && (
            <div className="flex items-center gap-1 mb-1.5 animate-fade-in">
              <Link2 className="h-3 w-3 text-text-tertiary" />
              <span className="text-[10px] text-text-tertiary truncate">
                Remixed from <span className="text-text-secondary">{sourceTitle}</span>
              </span>
            </div>
          )}

          {/* Body preview */}
          <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed mb-3">
            {item.body}
          </p>

          {/* Footer: date + actions */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {new Date(item.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>

            {/* Hover actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                className="rounded-md p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemix();
                }}
                className="rounded-md p-1.5 text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors"
                title="Remix"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md p-1.5 text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
