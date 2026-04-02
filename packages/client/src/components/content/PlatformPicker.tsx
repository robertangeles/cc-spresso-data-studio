import type { Channel } from '../../hooks/useContent';

interface PlatformPickerProps {
  channels: Channel[];
  selected: Set<string>;
  onToggle: (channelId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  x: '#1DA1F2',
  linkedin: '#0A66C2',
  instagram: '#E1306C',
  facebook: '#1877F2',
  threads: '#A0A0A0',
  tiktok: '#00F2EA',
  pinterest: '#E60023',
  youtube: '#FF0000',
  bluesky: '#0085FF',
  email: '#F59E0B',
  blog: '#10B981',
};

export function getPlatformColor(slug: string): string {
  return PLATFORM_COLORS[slug.toLowerCase()] ?? '#ffd60a';
}

export function PlatformPicker({
  channels,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: PlatformPickerProps) {
  const allSelected = channels.length > 0 && selected.size === channels.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Target Platforms
        </span>
        <button
          type="button"
          onClick={allSelected ? onClearAll : onSelectAll}
          className="text-[11px] text-accent hover:text-accent-hover transition-colors"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {channels.map((ch) => {
          const isSelected = selected.has(ch.id);
          const color = getPlatformColor(ch.slug);

          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onToggle(ch.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-200 ease-spring
                ${
                  isSelected
                    ? 'border-white/10 bg-white/[0.04] shadow-[0_0_12px_rgba(255,255,255,0.03)]'
                    : 'border-border-subtle bg-surface-2/40 hover:border-border-hover hover:bg-surface-2/60'
                }`}
              style={
                isSelected
                  ? { borderColor: `${color}40`, boxShadow: `0 0 12px ${color}15` }
                  : undefined
              }
            >
              {/* Platform color dot */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded text-xs transition-transform duration-200 ${isSelected ? 'scale-110' : ''}`}
                style={{ background: `${color}20` }}
              >
                {ch.icon}
              </span>

              <span
                className={`text-xs font-medium transition-colors ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}
              >
                {ch.name}
              </span>

              {/* Check indicator */}
              {isSelected && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full animate-scale-in"
                  style={{ background: color }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
