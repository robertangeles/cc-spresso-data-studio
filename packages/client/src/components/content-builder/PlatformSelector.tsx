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
}

function formatCharLimit(limit: number | undefined | null): string {
  if (limit == null || limit === 0) return '∞';
  if (limit >= 1000) return `${Math.floor(limit / 1000)}K`;
  return `${limit}`;
}

/** Platform-specific accent colors */
const PLATFORM_COLORS: Record<
  string,
  {
    text: string;
    bg: string;
    gradientBg: string;
    border: string;
    ring: string;
    glow: string;
    leftBorder: string;
    checkBg: string;
  }
> = {
  twitter: {
    text: 'text-blue-400',
    bg: 'bg-blue-400/10',
    gradientBg: 'bg-gradient-to-r from-blue-400/15 to-blue-400/5',
    border: 'border-blue-400/50',
    ring: 'ring-1 ring-blue-400/40',
    glow: 'shadow-[0_0_16px_rgba(96,165,250,0.30)]',
    leftBorder: 'border-l-blue-400/40',
    checkBg: 'bg-blue-400',
  },
  linkedin: {
    text: 'text-blue-500',
    bg: 'bg-blue-500/10',
    gradientBg: 'bg-gradient-to-r from-blue-500/15 to-blue-500/5',
    border: 'border-blue-500/50',
    ring: 'ring-1 ring-blue-500/40',
    glow: 'shadow-[0_0_16px_rgba(59,130,246,0.30)]',
    leftBorder: 'border-l-blue-500/40',
    checkBg: 'bg-blue-500',
  },
  instagram: {
    text: 'text-pink-500',
    bg: 'bg-pink-500/10',
    gradientBg: 'bg-gradient-to-r from-pink-500/15 to-pink-500/5',
    border: 'border-pink-500/50',
    ring: 'ring-1 ring-pink-500/40',
    glow: 'shadow-[0_0_16px_rgba(236,72,153,0.30)]',
    leftBorder: 'border-l-pink-500/40',
    checkBg: 'bg-pink-500',
  },
  facebook: {
    text: 'text-blue-600',
    bg: 'bg-blue-600/10',
    gradientBg: 'bg-gradient-to-r from-blue-600/15 to-blue-600/5',
    border: 'border-blue-600/50',
    ring: 'ring-1 ring-blue-600/40',
    glow: 'shadow-[0_0_16px_rgba(37,99,235,0.30)]',
    leftBorder: 'border-l-blue-600/40',
    checkBg: 'bg-blue-600',
  },
  pinterest: {
    text: 'text-red-500',
    bg: 'bg-red-500/10',
    gradientBg: 'bg-gradient-to-r from-red-500/15 to-red-500/5',
    border: 'border-red-500/50',
    ring: 'ring-1 ring-red-500/40',
    glow: 'shadow-[0_0_16px_rgba(239,68,68,0.30)]',
    leftBorder: 'border-l-red-500/40',
    checkBg: 'bg-red-500',
  },
  tiktok: {
    text: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    gradientBg: 'bg-gradient-to-r from-cyan-400/15 to-cyan-400/5',
    border: 'border-cyan-400/50',
    ring: 'ring-1 ring-cyan-400/40',
    glow: 'shadow-[0_0_16px_rgba(34,211,238,0.30)]',
    leftBorder: 'border-l-cyan-400/40',
    checkBg: 'bg-cyan-400',
  },
  threads: {
    text: 'text-gray-300',
    bg: 'bg-gray-300/10',
    gradientBg: 'bg-gradient-to-r from-gray-300/15 to-gray-300/5',
    border: 'border-gray-300/50',
    ring: 'ring-1 ring-gray-300/40',
    glow: 'shadow-[0_0_16px_rgba(209,213,219,0.24)]',
    leftBorder: 'border-l-gray-300/40',
    checkBg: 'bg-gray-300',
  },
  bluesky: {
    text: 'text-sky-400',
    bg: 'bg-sky-400/10',
    gradientBg: 'bg-gradient-to-r from-sky-400/15 to-sky-400/5',
    border: 'border-sky-400/50',
    ring: 'ring-1 ring-sky-400/40',
    glow: 'shadow-[0_0_16px_rgba(56,189,248,0.30)]',
    leftBorder: 'border-l-sky-400/40',
    checkBg: 'bg-sky-400',
  },
  youtube: {
    text: 'text-red-600',
    bg: 'bg-red-600/10',
    gradientBg: 'bg-gradient-to-r from-red-600/15 to-red-600/5',
    border: 'border-red-600/50',
    ring: 'ring-1 ring-red-600/40',
    glow: 'shadow-[0_0_16px_rgba(220,38,38,0.30)]',
    leftBorder: 'border-l-red-600/40',
    checkBg: 'bg-red-600',
  },
  blog: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    gradientBg: 'bg-gradient-to-r from-emerald-400/15 to-emerald-400/5',
    border: 'border-emerald-400/50',
    ring: 'ring-1 ring-emerald-400/40',
    glow: 'shadow-[0_0_16px_rgba(52,211,153,0.30)]',
    leftBorder: 'border-l-emerald-400/40',
    checkBg: 'bg-emerald-400',
  },
  email: {
    text: 'text-amber-400',
    bg: 'bg-amber-400/10',
    gradientBg: 'bg-gradient-to-r from-amber-400/15 to-amber-400/5',
    border: 'border-amber-400/50',
    ring: 'ring-1 ring-amber-400/40',
    glow: 'shadow-[0_0_16px_rgba(251,191,36,0.30)]',
    leftBorder: 'border-l-amber-400/40',
    checkBg: 'bg-amber-400',
  },
};

const DEFAULT_COLOR = {
  text: 'text-accent',
  bg: 'bg-accent/10',
  gradientBg: 'bg-gradient-to-r from-accent/15 to-accent/5',
  border: 'border-accent/50',
  ring: 'ring-1 ring-accent/40',
  glow: 'shadow-[0_0_16px_rgba(255,214,10,0.24)]',
  leftBorder: 'border-l-accent/40',
  checkBg: 'bg-accent',
};

function getPlatformColor(slug: string) {
  return PLATFORM_COLORS[slug] ?? DEFAULT_COLOR;
}

/** Grouped platform ordering — Social first, then Long-form */
const PLATFORM_GROUPS = [
  {
    label: 'Social',
    slugs: [
      'twitter',
      'linkedin',
      'instagram',
      'facebook',
      'threads',
      'bluesky',
      'tiktok',
      'pinterest',
    ],
  },
  { label: 'Long-form', slugs: ['blog', 'email', 'youtube'] },
];

const KNOWN_SLUGS = PLATFORM_GROUPS.flatMap((g) => g.slugs);

export function PlatformSelector({ channels, selectedIds, onToggle }: PlatformSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedChannels = channels.filter((ch) => selectedIds.includes(ch.id));

  function renderChip(ch: Channel) {
    const isSelected = selectedIds.includes(ch.id);
    const limitLabel = formatCharLimit(ch.config?.charLimit as number | undefined | null);
    const color = getPlatformColor(ch.slug);

    return (
      <button
        key={ch.id}
        type="button"
        onClick={() => onToggle(ch.id)}
        className={`relative inline-flex items-center gap-2 rounded-lg border-l-[3px] border px-3 py-2 text-sm font-medium transition-all duration-200 ease-spring hover:scale-[1.02] focus:outline-none focus:ring-1 focus:ring-border-focus ${
          isSelected
            ? `${color.gradientBg} ${color.border} ${color.text} ${color.glow} ${color.ring} ${color.leftBorder} animate-scale-in`
            : `border-border-subtle bg-surface-2/50 text-text-secondary ${color.leftBorder} hover:border-border-default hover:text-text-primary hover:shadow-dark-sm`
        }`}
      >
        {isSelected && (
          <span
            className={`absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full ${color.checkBg} shadow-md`}
          >
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
        )}
        <span
          className={`leading-none transition-all duration-200 ${isSelected ? 'text-xl' : 'text-lg'}`}
        >
          {ch.icon}
        </span>
        <span>{ch.name}</span>
        <span className="text-[10px] opacity-60 font-normal">{limitLabel}</span>
      </button>
    );
  }

  return (
    <div>
      {/* Summary bar — always visible */}
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
              {selectedChannels.slice(0, 4).map((ch) => {
                const color = getPlatformColor(ch.slug);
                return (
                  <span key={ch.id} className={`inline-flex items-center gap-1.5 ${color.text}`}>
                    <span className="text-base leading-none">{ch.icon}</span>
                    <span className="font-medium">{ch.name}</span>
                  </span>
                );
              })}
              {selectedChannels.length > 4 && (
                <span className="text-text-tertiary text-xs font-medium">
                  +{selectedChannels.length - 4} more
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

      {/* Expandable chip grid — grouped by type */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isExpanded ? '500px' : '0px',
          opacity: isExpanded ? 1 : 0,
          marginTop: isExpanded ? '8px' : '0px',
        }}
      >
        <div className="bg-surface-1/40 rounded-xl border border-border-subtle p-4">
          {PLATFORM_GROUPS.map((group) => {
            const groupChannels = group.slugs
              .map((slug) => channels.find((ch) => ch.slug === slug))
              .filter((ch): ch is Channel => ch != null);
            if (groupChannels.length === 0) return null;
            return (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-0.5">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groupChannels.map((ch) => renderChip(ch))}
                </div>
              </div>
            );
          })}

          {/* Ungrouped channels (future-proofing) */}
          {channels.filter((ch) => !KNOWN_SLUGS.includes(ch.slug)).length > 0 && (
            <div className="mb-3 last:mb-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-0.5">
                Other
              </p>
              <div className="flex flex-wrap gap-2">
                {channels
                  .filter((ch) => !KNOWN_SLUGS.includes(ch.slug))
                  .map((ch) => renderChip(ch))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
