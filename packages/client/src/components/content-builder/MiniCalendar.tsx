import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  AlertTriangle,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useScheduledPosts } from '../../hooks/useScheduledPosts';
import {
  getMonthGrid,
  isSameDay,
  formatTime,
  getPlatformColor,
  type ScheduledPost,
} from '../../utils/calendar';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function StatusBadge({
  status,
  error,
  onRetry,
}: {
  status: ScheduledPost['status'];
  error?: string | null;
  onRetry?: () => void;
}) {
  switch (status) {
    case 'published':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-status-success-dim px-1.5 py-0.5 text-[9px] font-medium text-status-success">
          <Check className="h-2.5 w-2.5" />
          Published
        </span>
      );
    case 'failed':
      return (
        <span className="flex items-center gap-1">
          <span
            className="flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400 cursor-help"
            title={error || 'Publishing failed'}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            Failed
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="flex items-center gap-0.5 rounded-full bg-accent-dim px-1.5 py-0.5 text-[9px] font-medium text-accent hover:bg-accent/20 transition-colors"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Retry
            </button>
          )}
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="rounded-full bg-status-warning-dim px-1.5 py-0.5 text-[9px] font-medium text-status-warning">
          Pending
        </span>
      );
  }
}

interface MiniCalendarProps {
  onSelectDate: (date: string) => void;
  refreshKey?: number;
}

export function MiniCalendar({ onSelectDate, refreshKey = 0 }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string>(() => new Date().toDateString());

  const { postsByDate, handleDelete, handleRetry } = useScheduledPosts(currentMonth, refreshKey);

  const today = useMemo(() => new Date(), []);

  const gridDays = useMemo(
    () => getMonthGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth],
  );

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const isCurrentMonth = (day: Date) => day.getMonth() === currentMonth.getMonth();

  function navigatePrev() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d);
    setSelectedDay(new Date(d.getFullYear(), d.getMonth(), 1).toDateString());
  }

  function navigateNext() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d);
    setSelectedDay(new Date(d.getFullYear(), d.getMonth(), 1).toDateString());
  }

  function handleDayClick(day: Date) {
    const dayKey = day.toDateString();
    setSelectedDay(dayKey);

    const now = new Date();
    const isPast = !isSameDay(day, now) && day < now;

    // Only set schedule date for today or future days
    if (!isPast) {
      const scheduled = new Date(day);
      if (isSameDay(day, now)) {
        scheduled.setHours(now.getHours(), now.getMinutes() + 30, 0, 0);
      } else {
        scheduled.setHours(9, 0, 0, 0);
      }
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${scheduled.getFullYear()}-${pad(scheduled.getMonth() + 1)}-${pad(scheduled.getDate())}T${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`;
      onSelectDate(dateStr);
    }
  }

  const selectedPosts = postsByDate.get(selectedDay) ?? [];

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={navigatePrev}
          className="rounded p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold text-text-primary">{monthLabel}</span>
        <button
          type="button"
          onClick={navigateNext}
          className="rounded p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-text-tertiary"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {gridDays.map((day) => {
          const dayKey = day.toDateString();
          const dayPosts = postsByDate.get(dayKey) ?? [];
          const isToday = isSameDay(day, today);
          const inMonth = isCurrentMonth(day);
          const isSelected = selectedDay === dayKey;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => handleDayClick(day)}
              className={`relative flex flex-col items-center py-1 rounded transition-all text-[11px] ${
                !inMonth ? 'opacity-30' : ''
              } ${
                isSelected
                  ? 'bg-accent/15 text-accent font-bold'
                  : isToday
                    ? 'font-bold text-accent'
                    : 'text-text-secondary hover:bg-surface-3'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  isToday && !isSelected ? 'ring-1 ring-accent/40' : ''
                } ${isSelected ? 'bg-accent text-text-inverse' : ''}`}
              >
                {day.getDate()}
              </span>
              {/* Platform dots */}
              {dayPosts.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayPosts.slice(0, 3).map((p, i) => (
                    <span
                      key={i}
                      className={`h-1 w-1 rounded-full ${getPlatformColor(p.platform)}`}
                    />
                  ))}
                  {dayPosts.length > 3 && (
                    <span className="text-[7px] text-text-tertiary leading-none">+</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day post list */}
      <div className="border-t border-border-subtle pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
          {new Date(selectedDay).toLocaleDateString('default', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        {selectedPosts.length === 0 ? (
          <p className="text-[10px] text-text-tertiary py-2 text-center">No posts scheduled</p>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {selectedPosts.map((post) => (
              <div
                key={post.id}
                className="group rounded-md bg-surface-3/60 p-2 transition-colors hover:bg-surface-3"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${getPlatformColor(post.platform)}`}
                  />
                  <span className="truncate text-xs font-medium text-text-primary flex-1">
                    {post.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(post.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pl-3.5 mt-0.5">
                  <span className="text-[10px] text-text-secondary capitalize">
                    {post.platform}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-text-secondary">
                    <Clock className="h-2.5 w-2.5" />
                    {formatTime(post.scheduledAt)}
                  </span>
                  <StatusBadge
                    status={post.status}
                    error={post.error}
                    onRetry={post.status === 'failed' ? () => handleRetry(post.id) : undefined}
                  />
                </div>
                {post.accountName && (
                  <div className="pl-3.5 -mt-0.5">
                    <span className="text-[10px] text-text-secondary leading-tight">
                      @{post.accountName}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
