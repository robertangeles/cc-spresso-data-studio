import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  AlertTriangle,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';

interface ScheduledPost {
  id: string;
  title: string;
  platform: string;
  scheduledAt: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  error?: string | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'bg-sky-400',
  x: 'bg-sky-400',
  linkedin: 'bg-blue-500',
  instagram: 'bg-pink-500',
  facebook: 'bg-indigo-500',
  youtube: 'bg-red-500',
  tiktok: 'bg-fuchsia-500',
  bluesky: 'bg-sky-500',
  newsletter: 'bg-amber-500',
  blog: 'bg-emerald-500',
  default: 'bg-text-tertiary',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getPlatformColor(platform: string | undefined | null): string {
  if (!platform) return PLATFORM_COLORS.default;
  return PLATFORM_COLORS[platform.toLowerCase()] ?? PLATFORM_COLORS.default;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const days: Date[] = [];

  // Leading days from previous month
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to fill the grid (complete rows of 7)
  while (days.length % 7 !== 0) {
    const next = days.length - startDay - last.getDate() + 1;
    days.push(new Date(year, month + 1, next));
  }

  return days;
}

function getWeekGrid(current: Date): Date[] {
  const day = current.getDay();
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(current);
    d.setDate(current.getDate() - day + i);
    days.push(d);
  }
  return days;
}

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

export function ContentCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const { toast } = useToast();

  const today = useMemo(() => new Date(), []);

  const gridDays = useMemo(() => {
    if (viewMode === 'month') {
      return getMonthGrid(currentMonth.getFullYear(), currentMonth.getMonth());
    }
    return getWeekGrid(currentMonth);
  }, [currentMonth, viewMode]);

  const startStr = useMemo(() => gridDays[0]?.toISOString().split('T')[0] ?? '', [gridDays]);
  const endStr = useMemo(
    () => gridDays[gridDays.length - 1]?.toISOString().split('T')[0] ?? '',
    [gridDays],
  );

  const fetchPosts = useMemo(
    () => () => {
      if (!startStr || !endStr) return;
      api
        .get(`/schedule/calendar?start=${startStr}&end=${endStr}`)
        .then(({ data }) => setPosts(data.data ?? []))
        .catch(() => {});
    },
    [startStr, endStr],
  );

  // Initial fetch
  useEffect(() => {
    if (!startStr || !endStr) return;
    setLoading(true);
    fetchPosts();
    setLoading(false);
  }, [fetchPosts, startStr, endStr]);

  // Poll every 30s when there are pending posts
  useEffect(() => {
    const hasPending = posts.some((p) => p.status === 'pending');
    if (!hasPending) return;
    const interval = setInterval(fetchPosts, 30_000);
    return () => clearInterval(interval);
  }, [posts, fetchPosts]);

  async function handleDelete(postId: string) {
    try {
      await api.delete(`/schedule/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast('Post deleted', 'success');
    } catch {
      toast('Failed to delete post', 'error');
    }
  }

  async function handleRetry(postId: string) {
    try {
      await api.post(`/schedule/${postId}/retry`);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: 'pending' as const, error: null } : p)),
      );
      toast('Retrying publish...', 'info');
    } catch {
      toast('Failed to retry', 'error');
    }
  }

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of posts) {
      const key = new Date(post.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  function navigatePrev() {
    const d = new Date(currentMonth);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 7);
    }
    setCurrentMonth(d);
    setExpandedDay(null);
  }

  function navigateNext() {
    const d = new Date(currentMonth);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 7);
    }
    setCurrentMonth(d);
    setExpandedDay(null);
  }

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const isCurrentMonth = (day: Date) => day.getMonth() === currentMonth.getMonth();

  function toggleDay(dayKey: string) {
    setExpandedDay((prev) => (prev === dayKey ? null : dayKey));
  }

  return (
    <div className="-m-6">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim">
            <CalendarDays className="h-5 w-5 text-accent" />
          </div>
          <h1 className="text-lg font-bold text-text-primary">Content Calendar</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border-subtle bg-surface-1 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-200 ${
                viewMode === 'month'
                  ? 'bg-accent text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-200 ${
                viewMode === 'week'
                  ? 'bg-accent text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Week
            </button>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={navigatePrev}
              className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-semibold text-text-primary">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={navigateNext}
              className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading && posts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-tertiary">Loading calendar...</p>
          </div>
        ) : (
          <div>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-px">
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className={`grid grid-cols-7 gap-px ${viewMode === 'week' ? 'grid-rows-1' : ''}`}>
              {gridDays.map((day) => {
                const dayKey = day.toDateString();
                const dayPosts = postsByDate.get(dayKey) ?? [];
                const isToday = isSameDay(day, today);
                const inMonth = viewMode === 'week' || isCurrentMonth(day);
                const hasPosts = dayPosts.length > 0;
                const isExpanded = expandedDay === dayKey;

                return (
                  <div
                    key={dayKey}
                    className={`relative rounded-lg border transition-all duration-200 ${
                      viewMode === 'week' ? 'min-h-[300px]' : 'min-h-[100px]'
                    } ${isToday ? 'border-accent ring-1 ring-accent/30' : 'border-border-subtle'} ${
                      hasPosts ? 'bg-surface-2' : 'bg-surface-1'
                    } ${!inMonth ? 'opacity-40' : ''}`}
                  >
                    {/* Day number */}
                    <button
                      type="button"
                      onClick={() => hasPosts && toggleDay(dayKey)}
                      className="w-full p-1.5 text-left"
                    >
                      <span
                        className={`text-xs font-medium ${
                          isToday
                            ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-text-inverse'
                            : 'text-text-secondary'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </button>

                    {/* Month view: compact time cards */}
                    {viewMode === 'month' && dayPosts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDay(dayKey)}
                        className="w-full space-y-0.5 px-1 pb-1 text-left"
                      >
                        {dayPosts.slice(0, 3).map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-1 rounded bg-surface-3/60 px-1 py-0.5"
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${getPlatformColor(p.platform)}`}
                            />
                            <span className="truncate text-[9px] text-text-tertiary">
                              {formatTime(p.scheduledAt)}
                            </span>
                          </div>
                        ))}
                        {dayPosts.length > 3 && (
                          <span className="block text-center text-[9px] text-text-tertiary">
                            +{dayPosts.length - 3} more
                          </span>
                        )}
                      </button>
                    )}

                    {/* Week view: show post details inline */}
                    {viewMode === 'week' && dayPosts.length > 0 && (
                      <div className="space-y-1 px-2 pb-2">
                        {dayPosts.map((post) => (
                          <div
                            key={post.id}
                            className="group rounded-md bg-surface-3 p-1.5 transition-colors hover:bg-surface-3/80"
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${getPlatformColor(post.platform)}`}
                              />
                              <span className="truncate text-[11px] font-medium text-text-primary flex-1">
                                {post.title}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(post.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 pl-3.5">
                              <span className="text-[10px] text-text-tertiary capitalize">
                                {post.platform}
                              </span>
                              <span className="flex items-center gap-0.5 text-[10px] text-text-tertiary">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTime(post.scheduledAt)}
                              </span>
                              <StatusBadge
                                status={post.status}
                                error={post.error}
                                onRetry={
                                  post.status === 'failed' ? () => handleRetry(post.id) : undefined
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Month view: expanded day dropdown */}
                    {viewMode === 'month' && isExpanded && dayPosts.length > 0 && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border-default bg-surface-2 p-2 shadow-dark-lg backdrop-blur-glass animate-scale-in">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                          {day.toLocaleDateString('default', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {dayPosts.map((post) => (
                            <div
                              key={post.id}
                              className="group rounded-md bg-surface-3 p-2 transition-colors hover:bg-surface-3/80"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className={`h-2 w-2 rounded-full shrink-0 ${getPlatformColor(post.platform)}`}
                                />
                                <span className="truncate text-[11px] font-medium text-text-primary flex-1">
                                  {post.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(post.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2 pl-3.5">
                                <span className="text-[10px] text-text-tertiary capitalize">
                                  {post.platform}
                                </span>
                                <span className="flex items-center gap-0.5 text-[10px] text-text-tertiary">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatTime(post.scheduledAt)}
                                </span>
                                <StatusBadge
                                  status={post.status}
                                  error={post.error}
                                  onRetry={
                                    post.status === 'failed'
                                      ? () => handleRetry(post.id)
                                      : undefined
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty state */}
            {!loading && posts.length === 0 && (
              <div className="mt-16 flex flex-col items-center justify-center text-center">
                <CalendarDays className="mb-3 h-10 w-10 text-text-tertiary/50" />
                <p className="text-sm text-text-secondary">No scheduled content yet.</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  Head to Content Builder to create your first post.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
