import { useState } from 'react';
import { Link } from 'react-router-dom';
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

interface PlatformSelectorProps {
  channels: Channel[];
  selectedIds: string[];
  onToggle: (channelId: string) => void;
  connectedPlatforms?: string[];
  /** 'horizontal' = collapsible dropdown (default), 'vertical' = always-visible card stack */
  layout?: 'horizontal' | 'vertical';
  /** Map of channelId → connected social accounts (for multi-account picker) */
  accountsByChannel?: Record<string, SocialAccount[]>;
  /** Currently selected account IDs per channel */
  selectedAccounts?: Record<string, string[]>;
  /** Toggle a specific account within a channel */
  onToggleAccount?: (channelId: string, accountId: string) => void;
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
  'youtube',
];

// Platforms that don't need OAuth (always "connected")
const ALWAYS_CONNECTED = ['blog'];

export function PlatformSelector({
  channels,
  selectedIds,
  onToggle,
  connectedPlatforms = [],
  layout = 'horizontal',
  accountsByChannel = {},
  selectedAccounts = {},
  onToggleAccount,
}: PlatformSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConnectHint, setShowConnectHint] = useState(false);

  const selectedChannels = channels.filter((ch) => selectedIds.includes(ch.id));

  // Sort channels by preferred order
  const sortedChannels = [...channels].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.slug);
    const bi = PLATFORM_ORDER.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ─── Vertical layout (left panel sidebar) ───
  if (layout === 'vertical') {
    return (
      <div className="space-y-2">
        {sortedChannels.map((ch) => {
          const isSelected = selectedIds.includes(ch.id);
          const isConnected =
            connectedPlatforms.includes(ch.slug) || ALWAYS_CONNECTED.includes(ch.slug);
          const color = getColor(ch.slug);
          const limit = formatCharLimit(ch.config?.charLimit as number | undefined | null);
          const accounts = accountsByChannel[ch.id] ?? [];
          const showSubPicker = isSelected && accounts.length >= 2;
          const selectedForChannel = selectedAccounts[ch.id] ?? [];

          return (
            <div key={ch.id}>
              <button
                type="button"
                onClick={() => onToggle(ch.id)}
                className={`relative w-full flex items-center gap-3 rounded-xl p-2.5 transition-all duration-200 ease-spring cursor-pointer group ${
                  isSelected
                    ? `bg-gradient-to-r ${color.cardBg} ${color.border} border ${color.glow}`
                    : `bg-surface-2/20 border border-transparent hover:bg-gradient-to-r hover:${color.cardBg} hover:border-border-subtle hover:shadow-md active:scale-[0.97]`
                }`}
              >
                {/* Platform icon */}
                <span
                  className={`text-xl leading-none transition-transform duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}
                >
                  {ch.icon}
                </span>

                {/* Name + meta */}
                <div className="flex-1 text-left min-w-0">
                  <span
                    className={`text-xs font-medium block truncate transition-colors duration-200 ${isSelected ? color.text : 'text-text-secondary'}`}
                  >
                    {ch.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-text-tertiary/30'}`}
                    />
                    <span className="text-[9px] text-text-tertiary">{limit} chars</span>
                  </div>
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 shadow-md shrink-0">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>

              {/* Account sub-picker — shown when platform selected & has 2+ accounts */}
              {showSubPicker && (
                <div className="ml-5 mt-1 space-y-1 animate-slide-up">
                  {accounts.map((account, idx) => {
                    const isAccountSelected = selectedForChannel.includes(account.id);
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
                        className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                          isAccountSelected
                            ? `bg-gradient-to-r ${color.cardBg} border ${color.border} ${color.glow.replace('20px', '10px')}`
                            : 'bg-surface-2/10 border border-transparent hover:bg-surface-2/30 hover:border-border-subtle'
                        }`}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 transition-colors duration-150 ${
                            isAccountSelected
                              ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]'
                              : 'bg-text-tertiary/30'
                          }`}
                        />
                        <span
                          className={`text-[11px] font-medium truncate transition-colors duration-150 ${
                            isAccountSelected ? color.text : 'text-text-tertiary'
                          }`}
                        >
                          {displayName}
                        </span>
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
              )}
            </div>
          );
        })}

        {/* Connection hint */}
        {selectedChannels.some(
          (ch) => !connectedPlatforms.includes(ch.slug) && !ALWAYS_CONNECTED.includes(ch.slug),
        ) && (
          <div className="mt-3 rounded-lg bg-accent/[0.06] border border-accent/15 px-3 py-2">
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              <span className="text-accent font-medium">Tip:</span> Connect accounts in{' '}
              <Link to="/profile" className="text-accent underline hover:text-accent-hover">
                Settings
              </Link>{' '}
              for auto-publishing.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Horizontal layout (collapsible dropdown — original) ───
  return (
    <div className="relative">
      {/* Click-outside dismiss */}
      {isExpanded && <div className="fixed inset-0 z-30" onClick={() => setIsExpanded(false)} />}

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

      {/* Floating card grid overlay */}
      {isExpanded && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 animate-scale-in">
          <div className="grid grid-cols-4 gap-2 p-3 bg-surface-1 rounded-xl border border-border-subtle shadow-dark-lg backdrop-blur-glass">
            {sortedChannels.map((ch) => {
              const isSelected = selectedIds.includes(ch.id);
              const isConnected =
                connectedPlatforms.includes(ch.slug) || ALWAYS_CONNECTED.includes(ch.slug);
              const color = getColor(ch.slug);
              const limit = formatCharLimit(ch.config?.charLimit as number | undefined | null);

              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    onToggle(ch.id);
                    // Show connect hint when selecting an unconnected social platform
                    if (
                      !isSelected &&
                      !connectedPlatforms.includes(ch.slug) &&
                      !ALWAYS_CONNECTED.includes(ch.slug)
                    ) {
                      setShowConnectHint(true);
                    }
                  }}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all duration-200 ease-spring cursor-pointer group ${
                    isSelected
                      ? `bg-gradient-to-b ${color.cardBg} ${color.border} border ${color.glow} scale-[1.03]`
                      : `bg-surface-2/30 border border-transparent hover:bg-gradient-to-b hover:${color.cardBg} hover:border-border-subtle hover:scale-[1.06] hover:-translate-y-1 hover:shadow-lg active:scale-95`
                  }`}
                >
                  {/* Selected checkmark */}
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 shadow-md">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </span>
                  )}

                  {/* Platform icon — large, bounces on hover */}
                  <span
                    className={`text-2xl leading-none transition-transform duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-125 group-hover:-translate-y-1'}`}
                  >
                    {ch.icon}
                  </span>

                  {/* Platform name */}
                  <span
                    className={`text-xs font-medium transition-all duration-200 ${isSelected ? color.text : `text-text-secondary group-hover:${color.text}`}`}
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
      )}

      {/* Connection hint — shown only when at least one selected platform is unconnected */}
      {showConnectHint &&
        selectedChannels.some(
          (ch) => !connectedPlatforms.includes(ch.slug) && !ALWAYS_CONNECTED.includes(ch.slug),
        ) && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-accent/[0.06] border border-accent/15 px-3 py-2 animate-slide-up">
            <p className="text-xs text-text-secondary">
              <span className="text-accent font-medium">Tip:</span> Connect your social accounts in{' '}
              <Link to="/profile" className="text-accent underline hover:text-accent-hover">
                Profile → Social Accounts
              </Link>{' '}
              for auto-publishing. For now, content will be ready for manual posting.
            </p>
            <button
              type="button"
              onClick={() => setShowConnectHint(false)}
              className="ml-3 text-text-tertiary hover:text-text-secondary text-xs shrink-0"
            >
              Got it
            </button>
          </div>
        )}
    </div>
  );
}
