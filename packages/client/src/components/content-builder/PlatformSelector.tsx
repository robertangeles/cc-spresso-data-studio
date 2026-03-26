import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: Record<string, unknown>;
}

interface PlatformSelectorProps {
  channels: Channel[];
  selectedIds: string[];
  onToggle: (channelId: string) => void;
  connectedPlatforms?: string[];
}

function formatCharLimit(limit: number | undefined | null): string {
  if (limit == null || limit === 0) return '∞';
  if (limit >= 1000) return `${Math.floor(limit / 1000)}K`;
  return `${limit}`;
}

const PLATFORM_COLORS: Record<
  string,
  { text: string; bg: string; border: string; glow: string; cardBg: string }
> = {
  twitter: {
    text: 'text-blue-400',
    bg: 'bg-blue-400',
    border: 'border-blue-400/50',
    glow: 'shadow-[0_0_20px_rgba(96,165,250,0.25)]',
    cardBg: 'from-blue-400/10 to-transparent',
  },
  linkedin: {
    text: 'text-blue-500',
    bg: 'bg-blue-500',
    border: 'border-blue-500/50',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
    cardBg: 'from-blue-500/10 to-transparent',
  },
  instagram: {
    text: 'text-pink-500',
    bg: 'bg-pink-500',
    border: 'border-pink-500/50',
    glow: 'shadow-[0_0_20px_rgba(236,72,153,0.25)]',
    cardBg: 'from-pink-500/10 to-transparent',
  },
  facebook: {
    text: 'text-blue-600',
    bg: 'bg-blue-600',
    border: 'border-blue-600/50',
    glow: 'shadow-[0_0_20px_rgba(37,99,235,0.25)]',
    cardBg: 'from-blue-600/10 to-transparent',
  },
  pinterest: {
    text: 'text-red-500',
    bg: 'bg-red-500',
    border: 'border-red-500/50',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
    cardBg: 'from-red-500/10 to-transparent',
  },
  tiktok: {
    text: 'text-cyan-400',
    bg: 'bg-cyan-400',
    border: 'border-cyan-400/50',
    glow: 'shadow-[0_0_20px_rgba(34,211,238,0.25)]',
    cardBg: 'from-cyan-400/10 to-transparent',
  },
  threads: {
    text: 'text-gray-300',
    bg: 'bg-gray-300',
    border: 'border-gray-300/50',
    glow: 'shadow-[0_0_20px_rgba(209,213,219,0.20)]',
    cardBg: 'from-gray-300/10 to-transparent',
  },
  bluesky: {
    text: 'text-sky-400',
    bg: 'bg-sky-400',
    border: 'border-sky-400/50',
    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.25)]',
    cardBg: 'from-sky-400/10 to-transparent',
  },
  youtube: {
    text: 'text-red-600',
    bg: 'bg-red-600',
    border: 'border-red-600/50',
    glow: 'shadow-[0_0_20px_rgba(220,38,38,0.25)]',
    cardBg: 'from-red-600/10 to-transparent',
  },
  blog: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-400',
    border: 'border-emerald-400/50',
    glow: 'shadow-[0_0_20px_rgba(52,211,153,0.25)]',
    cardBg: 'from-emerald-400/10 to-transparent',
  },
  email: {
    text: 'text-amber-400',
    bg: 'bg-amber-400',
    border: 'border-amber-400/50',
    glow: 'shadow-[0_0_20px_rgba(251,191,36,0.25)]',
    cardBg: 'from-amber-400/10 to-transparent',
  },
};

const DEFAULT_COLOR = {
  text: 'text-accent',
  bg: 'bg-accent',
  border: 'border-accent/50',
  glow: 'shadow-[0_0_20px_rgba(255,214,10,0.20)]',
  cardBg: 'from-accent/10 to-transparent',
};

function getColor(slug: string) {
  return PLATFORM_COLORS[slug] ?? DEFAULT_COLOR;
}

/** Platform ordering — most popular first */
const PLATFORM_ORDER = [
  'twitter',
  'linkedin',
  'instagram',
  'facebook',
  'threads',
  'bluesky',
  'tiktok',
  'pinterest',
  'blog',
  'email',
  'youtube',
];

export function PlatformSelector({
  channels,
  selectedIds,
  onToggle,
  connectedPlatforms = [],
}: PlatformSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedChannels = channels.filter((ch) => selectedIds.includes(ch.id));

  // Sort channels by preferred order
  const sortedChannels = [...channels].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.slug);
    const bi = PLATFORM_ORDER.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div>
      {/* Summary bar */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`w-full flex items-center justify-between backdrop-blur-sm rounded-xl border px-4 py-2.5 transition-all duration-200 cursor-pointer group ${
          selectedIds.length > 0
            ? 'bg-surface-1/80 border-border-subtle hover:border-border-default hover:bg-surface-1'
            : 'bg-gradient-to-r from-accent/5 to-surface-1/80 border-accent/20 hover:border-accent/40 hover:shadow-[0_0_15px_rgba(255,214,10,0.08)]'
        }`}
      >
        <div className="flex items-center gap-2 text-sm">
          {selectedIds.length === 0 ? (
            <span className="text-text-secondary font-medium">
              Select platforms to publish to...
            </span>
          ) : (
            <>
              {selectedChannels.slice(0, 5).map((ch) => {
                const color = getColor(ch.slug);
                return (
                  <span key={ch.id} className={`inline-flex items-center gap-1 ${color.text}`}>
                    <span className="text-base leading-none">{ch.icon}</span>
                    <span className="font-medium text-xs">{ch.name}</span>
                  </span>
                );
              })}
              {selectedChannels.length > 5 && (
                <span className="text-text-tertiary text-xs font-medium">
                  +{selectedChannels.length - 5} more
                </span>
              )}
            </>
          )}
        </div>
        <div
          className={`flex items-center gap-1.5 transition-colors ${
            selectedIds.length > 0
              ? 'text-text-secondary group-hover:text-text-primary'
              : 'text-accent group-hover:text-accent-hover'
          }`}
        >
          {selectedIds.length > 0 && (
            <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
              {selectedIds.length}
            </span>
          )}
          <span className="text-xs font-medium">
            {selectedIds.length > 0 ? 'Change' : 'Select Platforms'}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expandable card grid */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isExpanded ? '600px' : '0px',
          opacity: isExpanded ? 1 : 0,
          marginTop: isExpanded ? '8px' : '0px',
        }}
      >
        <div className="grid grid-cols-4 gap-2 p-3 bg-surface-1/40 rounded-xl border border-border-subtle">
          {sortedChannels.map((ch) => {
            const isSelected = selectedIds.includes(ch.id);
            const isConnected = connectedPlatforms.includes(ch.slug);
            const color = getColor(ch.slug);
            const limit = formatCharLimit(ch.config?.charLimit as number | undefined | null);

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onToggle(ch.id)}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all duration-200 ease-spring cursor-pointer group ${
                  isSelected
                    ? `bg-gradient-to-b ${color.cardBg} ${color.border} border ${color.glow} scale-[1.02]`
                    : 'bg-surface-2/30 border border-transparent hover:bg-surface-2/60 hover:border-border-subtle hover:scale-[1.01]'
                }`}
              >
                {/* Selected checkmark */}
                {isSelected && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full ${color.bg} shadow-md`}
                  >
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}

                {/* Platform icon — large */}
                <span
                  className={`text-2xl leading-none transition-transform duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                >
                  {ch.icon}
                </span>

                {/* Platform name */}
                <span
                  className={`text-xs font-medium transition-colors ${isSelected ? color.text : 'text-text-secondary group-hover:text-text-primary'}`}
                >
                  {ch.name}
                </span>

                {/* Connection status + char limit */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-text-tertiary/30'}`}
                  />
                  <span className="text-[9px] text-text-tertiary">{limit}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
