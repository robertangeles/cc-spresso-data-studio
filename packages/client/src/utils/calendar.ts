// ─── Types ───
export interface ScheduledPost {
  id: string;
  title: string;
  platform: string;
  scheduledAt: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  error?: string | null;
}

// ─── Platform colors ───
export const PLATFORM_COLORS: Record<string, string> = {
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

export function getPlatformColor(platform: string | undefined | null): string {
  if (!platform) return PLATFORM_COLORS.default;
  return PLATFORM_COLORS[platform.toLowerCase()] ?? PLATFORM_COLORS.default;
}

// ─── Date helpers ───
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getMonthGrid(year: number, month: number): Date[] {
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
