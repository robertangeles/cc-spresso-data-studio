import { Calendar, Workflow, FileText, Tag } from 'lucide-react';
import type { KanbanCard as KanbanCardType } from '@cc/shared';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

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
      {/* Label chips at top */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {card.labels.map((label) => (
            <span
              key={label.id}
              title={label.name}
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          ))}
        </div>
      )}

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

      {/* Assignee avatar — bottom right */}
      {card.assigneeId && card.assigneeName && (
        <div className="flex justify-end mt-2">
          {card.assigneeAvatar ? (
            <img
              src={card.assigneeAvatar}
              alt={card.assigneeName}
              title={card.assigneeName}
              className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <div
              title={card.assigneeName}
              className="h-5 w-5 rounded-full bg-gradient-to-br from-accent/40 to-amber-600/40 flex items-center justify-center text-[8px] font-bold text-accent ring-1 ring-accent/20"
            >
              {getInitials(card.assigneeName)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
