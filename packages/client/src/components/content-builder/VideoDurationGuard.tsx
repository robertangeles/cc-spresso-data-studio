import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface PlatformLimit {
  name: string;
  icon: string;
  maxSeconds: number;
  color: string;
}

const VIDEO_PLATFORMS: PlatformLimit[] = [
  { name: 'TikTok', icon: '🎵', maxSeconds: 600, color: 'cyan' },
  { name: 'Reels', icon: '📸', maxSeconds: 90, color: 'pink' },
  { name: 'Shorts', icon: '▶', maxSeconds: 60, color: 'red' },
  { name: 'YouTube', icon: '▶️', maxSeconds: 43200, color: 'red' }, // 12 hours
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins}m`;
}

interface VideoDurationGuardProps {
  /** Video duration in seconds (from Cloudinary metadata) */
  durationSeconds: number | null;
  /** Which platforms are selected (slugs) */
  selectedPlatforms?: string[];
}

/**
 * Shows per-platform duration status when a video is attached.
 * Green = within limit, Amber = close to limit, Red = exceeds limit.
 */
export function VideoDurationGuard({
  durationSeconds,
  selectedPlatforms = [],
}: VideoDurationGuardProps) {
  if (durationSeconds == null || durationSeconds <= 0) return null;

  // Only show platforms that are relevant
  const platformMap: Record<string, string> = {
    tiktok: 'TikTok',
    instagram: 'Reels',
    youtube: 'YouTube',
  };

  const relevantPlatforms = VIDEO_PLATFORMS.filter((p) => {
    if (selectedPlatforms.length === 0) return true; // Show all if none selected
    return selectedPlatforms.some((slug) => platformMap[slug] === p.name);
  });

  if (relevantPlatforms.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {relevantPlatforms.map((platform) => {
        const ratio = durationSeconds / platform.maxSeconds;
        const isOver = ratio > 1;
        const isClose = ratio > 0.8 && ratio <= 1;

        let StatusIcon = CheckCircle;
        let statusColor = 'text-green-400';
        let bgColor = 'bg-green-400/10 border-green-400/20';

        if (isOver) {
          StatusIcon = XCircle;
          statusColor = 'text-red-400';
          bgColor = 'bg-red-400/10 border-red-400/20';
        } else if (isClose) {
          StatusIcon = AlertTriangle;
          statusColor = 'text-amber-400';
          bgColor = 'bg-amber-400/10 border-amber-400/20';
        }

        return (
          <div
            key={platform.name}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${bgColor}`}
          >
            <span className="text-xs leading-none">{platform.icon}</span>
            <span className="text-[10px] text-text-secondary">
              {formatDuration(durationSeconds)} / {formatDuration(platform.maxSeconds)}
            </span>
            <StatusIcon className={`h-3 w-3 ${statusColor}`} />
          </div>
        );
      })}
    </div>
  );
}
