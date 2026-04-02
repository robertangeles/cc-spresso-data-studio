import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: Record<string, unknown>;
}

interface SocialAccount {
  id: string;
  platform: string;
  accountType: string;
  label: string | null;
  accountName: string | null;
  accountId: string | null;
  isConnected: boolean;
}

interface PlatformPillBarProps {
  channels: Channel[];
  selectedIds: string[];
  onToggle: (channelId: string) => void;
  connectedPlatforms?: string[];
  accountsByChannel?: Record<string, SocialAccount[]>;
  selectedAccounts?: Record<string, string[]>;
  onToggleAccount?: (channelId: string, accountId: string) => void;
}

/** Platform-specific glow colors as CSS custom property values */
const PILL_COLORS: Record<
  string,
  { text: string; glow: string; bg: string; border: string; accent: string }
> = {
  twitter: {
    text: 'text-blue-400',
    glow: 'rgba(96,165,250,0.3)',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/40',
    accent: 'rgba(96,165,250,0.5)',
  },
  linkedin: {
    text: 'text-blue-500',
    glow: 'rgba(59,130,246,0.3)',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/40',
    accent: 'rgba(59,130,246,0.5)',
  },
  instagram: {
    text: 'text-pink-500',
    glow: 'rgba(236,72,153,0.3)',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/40',
    accent: 'rgba(236,72,153,0.5)',
  },
  facebook: {
    text: 'text-blue-600',
    glow: 'rgba(37,99,235,0.3)',
    bg: 'bg-blue-600/10',
    border: 'border-blue-600/40',
    accent: 'rgba(37,99,235,0.5)',
  },
  pinterest: {
    text: 'text-red-500',
    glow: 'rgba(239,68,68,0.3)',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    accent: 'rgba(239,68,68,0.5)',
  },
  tiktok: {
    text: 'text-cyan-400',
    glow: 'rgba(34,211,238,0.3)',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/40',
    accent: 'rgba(34,211,238,0.5)',
  },
  threads: {
    text: 'text-gray-300',
    glow: 'rgba(209,213,219,0.2)',
    bg: 'bg-gray-300/10',
    border: 'border-gray-300/40',
    accent: 'rgba(209,213,219,0.4)',
  },
  bluesky: {
    text: 'text-sky-400',
    glow: 'rgba(56,189,248,0.3)',
    bg: 'bg-sky-400/10',
    border: 'border-sky-400/40',
    accent: 'rgba(56,189,248,0.5)',
  },
  youtube: {
    text: 'text-red-600',
    glow: 'rgba(220,38,38,0.3)',
    bg: 'bg-red-600/10',
    border: 'border-red-600/40',
    accent: 'rgba(220,38,38,0.5)',
  },
  blog: {
    text: 'text-emerald-400',
    glow: 'rgba(52,211,153,0.3)',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/40',
    accent: 'rgba(52,211,153,0.5)',
  },
  email: {
    text: 'text-amber-400',
    glow: 'rgba(251,191,36,0.3)',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/40',
    accent: 'rgba(251,191,36,0.5)',
  },
};

const DEFAULT_PILL = {
  text: 'text-accent',
  glow: 'rgba(255,214,10,0.25)',
  bg: 'bg-accent/10',
  accent: 'rgba(255,214,10,0.4)',
  border: 'border-accent/40',
};

function getPillColor(slug: string) {
  return PILL_COLORS[slug] ?? DEFAULT_PILL;
}

function formatCharLimit(limit: number | undefined | null): string {
  if (limit == null || limit === 0) return '∞';
  if (limit >= 1000) return `${Math.floor(limit / 1000)}K`;
  return `${limit}`;
}

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

const ALWAYS_CONNECTED = ['blog', 'email'];

export function PlatformPillBar({
  channels,
  selectedIds,
  onToggle,
  connectedPlatforms = [],
  accountsByChannel = {},
  selectedAccounts = {},
  onToggleAccount,
}: PlatformPillBarProps) {
  const [expandedPill, setExpandedPill] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close account popover on click outside
  useEffect(() => {
    if (!expandedPill) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setExpandedPill(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expandedPill]);

  const sortedChannels = [...channels].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.slug);
    const bi = PLATFORM_ORDER.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const handlePillClick = (ch: Channel) => {
    const isSelected = selectedIds.includes(ch.id);
    if (isSelected) {
      // If already selected and has multiple accounts, toggle account picker
      const accounts = accountsByChannel[ch.id] ?? [];
      if (accounts.length >= 2) {
        setExpandedPill(expandedPill === ch.id ? null : ch.id);
        return;
      }
    }
    onToggle(ch.id);
    setExpandedPill(null);
  };

  const selectedCount = selectedIds.length;

  return (
    <div>
      {/* Compact pill row — label integrated as first element */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-heading font-bold text-text-tertiary/60 uppercase tracking-[0.12em] mr-1">
          {selectedCount > 0 ? `${selectedCount} platforms` : 'Select platforms'}
        </span>
        {sortedChannels.map((ch, idx) => {
          const isSelected = selectedIds.includes(ch.id);
          const isConnected =
            connectedPlatforms.includes(ch.slug) || ALWAYS_CONNECTED.includes(ch.slug);
          const color = getPillColor(ch.slug);
          const limit = formatCharLimit(ch.config?.charLimit as number | undefined | null);
          const accounts = accountsByChannel[ch.id] ?? [];
          const hasMultiAccounts = isSelected && accounts.length >= 2;
          const isExpanded = expandedPill === ch.id;

          return (
            <div key={ch.id} className="relative">
              <button
                type="button"
                onClick={() => handlePillClick(ch)}
                className={`
                  pill-accent-bar inline-flex items-center gap-1.5 rounded-full px-3.5 py-2
                  text-xs font-medium transition-all duration-200 ease-spring
                  cursor-pointer select-none
                  animate-fade-in
                  ${
                    isSelected
                      ? `${color.bg} ${color.border} border ${color.text} pill-glow pill-active`
                      : `bg-surface-2/50 border border-border-default/30 text-text-secondary hover:${color.bg} hover:border-border-hover hover:${color.text} hover:scale-[1.04] hover:shadow-dark-sm active:scale-[0.96]`
                  }
                  ${isSelected ? 'animate-pill-select' : ''}
                `}
                style={
                  {
                    '--pill-glow-color': isSelected ? color.glow : undefined,
                    '--pill-accent-color': color.accent,
                    animationDelay: `${idx * 40}ms`,
                    animationFillMode: 'both',
                  } as React.CSSProperties
                }
              >
                {/* Icon — larger, always colorful */}
                <span
                  className={`text-base leading-none transition-transform duration-300 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}
                >
                  {ch.icon}
                </span>

                {/* Name */}
                <span className="font-heading font-semibold">{ch.name}</span>

                {/* Char limit badge */}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                    isSelected
                      ? 'bg-white/10 text-white/60'
                      : 'bg-surface-3/40 text-text-tertiary/60'
                  }`}
                >
                  {limit}
                </span>

                {/* Connection dot */}
                {!isConnected && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-400/60"
                    title="Not connected"
                  />
                )}

                {/* Multi-account indicator */}
                {hasMultiAccounts && (
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}

                {/* Selected check */}
                {isSelected && !hasMultiAccounts && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500/80">
                    <Check className="h-2 w-2 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>

              {/* Account popover */}
              {isExpanded && hasMultiAccounts && (
                <div
                  ref={popoverRef}
                  className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] animate-scale-in"
                >
                  <div className="rounded-lg border border-border-subtle bg-surface-1 shadow-dark-lg p-1.5 space-y-0.5">
                    {accounts.map((account) => {
                      const isAccountSelected = (selectedAccounts[ch.id] ?? []).includes(
                        account.id,
                      );
                      const displayName =
                        account.label || account.accountName || account.accountId || 'Account';
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleAccount?.(ch.id, account.id);
                          }}
                          className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                            isAccountSelected
                              ? `${color.bg} ${color.text}`
                              : 'text-text-secondary hover:bg-surface-2/50 hover:text-text-primary'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isAccountSelected ? 'bg-green-400' : 'bg-text-tertiary/30'
                            }`}
                          />
                          <span className="text-[11px] font-medium truncate">{displayName}</span>
                          {isAccountSelected && (
                            <Check
                              className={`h-3 w-3 ml-auto shrink-0 ${color.text}`}
                              strokeWidth={3}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
