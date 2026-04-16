import { Calendar, Workflow, FileText, Tag } from 'lucide-react';
import type { KanbanCard as KanbanCardType } from '@cc/shared';

interface KanbanCardProps {
  card: KanbanCardType;
  onDragStart: (e: React.DragEvent) => void;
  isDragging: boolean;
  onClick: () => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400 animate-pulse',
  high: 'bg-amber-500/15 text-amber-400',
  medium: 'bg-blue-500/15 text-blue-400',
  low: 'bg-slate-500/15 text-slate-400',
};

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function KanbanCard({ card, onDragStart, isDragging, onClick }: KanbanCardProps) {
  const priorityStyle = card.priority ? PRIORITY_STYLES[card.priority] || '' : '';
  const overdue = card.dueDate ? isOverdue(card.dueDate) : false;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`group rounded-lg bg-surface-1/80 backdrop-blur-sm border border-white/5 p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
        isDragging
          ? 'opacity-50 scale-95'
          : 'hover:-translate-y-0.5 hover:shadow-dark-lg hover:border-white/10'
      }`}
    >
      {/* Title */}
      <p className="text-sm font-medium text-text-primary line-clamp-2 leading-snug">
        {card.title}
      </p>

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Priority badge */}
        {card.priority && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityStyle}`}
          >
            {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
          </span>
        )}

        {/* Due date */}
        {card.dueDate && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] ${
              overdue ? 'text-red-400' : 'text-text-tertiary'
            }`}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(card.dueDate)}
          </span>
        )}

        {/* Link indicators */}
        {card.flowId && (
          <span className="text-text-tertiary" title="Linked to flow">
            <Workflow className="h-3 w-3" />
          </span>
        )}
        {card.contentItemId && (
          <span className="text-text-tertiary" title="Linked to content">
            <FileText className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <Tag className="h-3 w-3 text-text-tertiary flex-shrink-0" />
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-3/60 px-2 py-0.5 text-[10px] text-text-tertiary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
