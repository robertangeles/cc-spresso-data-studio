import { useMemo, useState } from 'react';
import type { ContentItem, Channel } from '../../hooks/useContent';
import { getPlatformColor } from './PlatformPicker';

interface PlatformCoverageBarProps {
  items: ContentItem[];
  channels: Channel[];
  onFilterPlatform: (channelId: string) => void;
}

export function PlatformCoverageBar({
  items,
  channels,
  onFilterPlatform,
}: PlatformCoverageBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const segments = useMemo(() => {
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const counts = new Map<string, number>();

    for (const item of items) {
      const key = item.channelId ?? '__none__';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const total = items.length || 1;
    return Array.from(counts.entries())
      .map(([channelId, count]) => {
        const channel = channelMap.get(channelId);
        return {
          channelId,
          channel,
          count,
          percentage: (count / total) * 100,
          color: channel ? getPlatformColor(channel.slug) : '#6B7280',
          label: channel?.name ?? 'Uncategorized',
          icon: channel?.icon ?? '📄',
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [items, channels]);

  if (items.length === 0) return null;

  return (
    <div className="mb-6 animate-fade-in">
      {/* Bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3/50 gap-px">
        {segments.map((seg) => (
          <button
            key={seg.channelId}
            type="button"
            onClick={() => seg.channel && onFilterPlatform(seg.channelId)}
            onMouseEnter={() => setHoveredId(seg.channelId)}
            onMouseLeave={() => setHoveredId(null)}
            className="h-full transition-all duration-300 ease-spring first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${Math.max(seg.percentage, 2)}%`,
              background: seg.color,
              opacity: hoveredId === null || hoveredId === seg.channelId ? 1 : 0.3,
              transform: hoveredId === seg.channelId ? 'scaleY(1.5)' : 'scaleY(1)',
            }}
            title={`${seg.label}: ${seg.count} (${Math.round(seg.percentage)}%)`}
          />
        ))}
      </div>

      {/* Legend — visible on hover */}
      {hoveredId &&
        (() => {
          const seg = segments.find((s) => s.channelId === hoveredId);
          if (!seg) return null;
          return (
            <div className="mt-1.5 flex items-center gap-2 animate-fade-in">
              <span className="h-2 w-2 rounded-full" style={{ background: seg.color }} />
              <span className="text-[11px] text-text-secondary">
                {seg.icon} {seg.label}
              </span>
              <span className="text-[11px] font-semibold text-text-primary tabular-nums">
                {seg.count} post{seg.count !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] text-text-tertiary tabular-nums">
                ({Math.round(seg.percentage)}%)
              </span>
            </div>
          );
        })()}
    </div>
  );
}
