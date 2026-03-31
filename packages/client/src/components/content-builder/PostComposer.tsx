import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Image, Loader2 } from 'lucide-react';

interface PostComposerProps {
  title: string;
  onTitleChange: (title: string) => void;
  mainBody: string;
  onMainBodyChange: (body: string) => void;
  platformBodies: Record<string, string>;
  onPlatformBodyChange: (channelId: string, body: string) => void;
  activeTab: string | null;
  onTabChange: (channelId: string | null) => void;
  selectedChannels: Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
    config: Record<string, unknown>;
  }>;
  imageUrl: string | null;
  onImageClick: () => void;
  isAdapting: boolean;
  onAdaptAll: () => void;
  flowState?: string;
  /** Slot for media controls rendered inline inside the card */
  mediaSlot?: React.ReactNode;
  /** Slot for platform selector rendered at the top of the card */
  headerSlot?: React.ReactNode;
}

/** Slugs that typically use a title field */
const TITLE_SLUGS = new Set(['blog', 'youtube', 'email', 'newsletter', 'article']);

/** Platform-specific tab colors */
const TAB_COLORS: Record<
  string,
  { active: string; border: string; bg: string; indicator: string }
> = {
  twitter: {
    active: 'text-blue-400',
    border: 'border-blue-400',
    bg: 'bg-blue-400/10',
    indicator: 'bg-blue-400',
  },
  linkedin: {
    active: 'text-blue-500',
    border: 'border-blue-500',
    bg: 'bg-blue-500/10',
    indicator: 'bg-blue-500',
  },
  instagram: {
    active: 'text-pink-500',
    border: 'border-pink-500',
    bg: 'bg-pink-500/10',
    indicator: 'bg-pink-500',
  },
  facebook: {
    active: 'text-blue-600',
    border: 'border-blue-600',
    bg: 'bg-blue-600/10',
    indicator: 'bg-blue-600',
  },
  pinterest: {
    active: 'text-red-500',
    border: 'border-red-500',
    bg: 'bg-red-500/10',
    indicator: 'bg-red-500',
  },
  tiktok: {
    active: 'text-cyan-400',
    border: 'border-cyan-400',
    bg: 'bg-cyan-400/10',
    indicator: 'bg-cyan-400',
  },
  threads: {
    active: 'text-gray-300',
    border: 'border-gray-300',
    bg: 'bg-gray-300/10',
    indicator: 'bg-gray-300',
  },
  bluesky: {
    active: 'text-sky-400',
    border: 'border-sky-400',
    bg: 'bg-sky-400/10',
    indicator: 'bg-sky-400',
  },
  youtube: {
    active: 'text-red-600',
    border: 'border-red-600',
    bg: 'bg-red-600/10',
    indicator: 'bg-red-600',
  },
  blog: {
    active: 'text-emerald-400',
    border: 'border-emerald-400',
    bg: 'bg-emerald-400/10',
    indicator: 'bg-emerald-400',
  },
  email: {
    active: 'text-amber-400',
    border: 'border-amber-400',
    bg: 'bg-amber-400/10',
    indicator: 'bg-amber-400',
  },
};

const DEFAULT_TAB_COLOR = {
  active: 'text-accent',
  border: 'border-accent',
  bg: 'bg-accent/10',
  indicator: 'bg-accent',
};

function getTabColor(slug: string) {
  return TAB_COLORS[slug] ?? DEFAULT_TAB_COLOR;
}

function getCharLimit(channel: { config: Record<string, unknown> } | undefined): number {
  if (!channel) return 0;
  return (channel.config?.charLimit as number) ?? 0;
}

function getOptimalLimit(channel: { config: Record<string, unknown> } | undefined): number {
  if (!channel) return 0;
  return (channel.config?.optimalCharLimit as number) ?? 0;
}

function formatCount(count: number, limit: number, optimal: number): string {
  if (limit === 0) return `${count}`;
  if (optimal > 0) return `${count}`;
  return `${count} / ${limit}`;
}

function getCountColor(count: number, limit: number, optimal: number): string {
  if (limit === 0) return 'text-text-tertiary';
  if (count > limit) return 'text-red-400';
  if (optimal > 0 && count > optimal) return 'text-amber-400';
  const ratio = count / limit;
  if (ratio > 0.9) return 'text-red-400';
  if (ratio > 0.7) return 'text-amber-400';
  return 'text-green-400';
}

/** Vertical progress bar on the right edge */
function VerticalProgress({
  count,
  limit,
  optimal,
}: {
  count: number;
  limit: number;
  optimal: number;
}) {
  if (limit === 0) return null;
  const fillPct = Math.min((count / limit) * 100, 100);
  const color =
    count > limit ? 'bg-red-400' : count > optimal && optimal > 0 ? 'bg-amber-400' : 'bg-green-400';

  return (
    <div className="absolute right-0 top-0 bottom-0 w-1 rounded-full bg-surface-3/30 overflow-hidden">
      <div
        className={`absolute bottom-0 w-full rounded-full transition-all duration-500 ease-spring ${color}`}
        style={{ height: `${fillPct}%` }}
      />
      {optimal > 0 && optimal < limit && (
        <div
          className="absolute w-full h-px bg-text-tertiary/30"
          style={{ bottom: `${(optimal / limit) * 100}%` }}
        />
      )}
    </div>
  );
}

function getPlaceholder(isMainTab: boolean, channelName?: string, flowState?: string): string {
  if (!isMainTab) {
    if (channelName) return `Customize for ${channelName}...`;
    return 'Write your content...';
  }
  switch (flowState) {
    case 'IDLE':
      return "What's on your mind? Start writing and we'll help you turn it into content for every platform...";
    case 'WRITING':
      return "Keep going... Select platforms when you're ready to adapt.";
    case 'PLATFORMS_SELECTED':
      return "Looking good! Click 'Adapt All' to generate versions for each platform.";
    case 'ADAPTED':
    case 'MEDIA_ADDED':
    case 'READY':
      return 'Content adapted! Edit any platform version using the tabs above.';
    default:
      return 'Write your content here...';
  }
}

export function PostComposer({
  title,
  onTitleChange,
  mainBody,
  onMainBodyChange,
  platformBodies,
  onPlatformBodyChange,
  activeTab,
  onTabChange,
  selectedChannels,
  imageUrl,
  onImageClick,
  isAdapting,
  onAdaptAll,
  flowState,
  mediaSlot,
  headerSlot,
}: PostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMainTab = activeTab === null;
  const showTabs = selectedChannels.length >= 2;

  const activeChannel = selectedChannels.find((ch) => ch.id === activeTab);
  const showTitle = isMainTab || (activeChannel && TITLE_SLUGS.has(activeChannel.slug));

  const currentBody = isMainTab
    ? mainBody
    : activeTab
      ? (platformBodies[activeTab] ?? '')
      : mainBody;

  const charLimit = isMainTab
    ? selectedChannels.reduce((min, ch) => {
        const lim = getCharLimit(ch);
        if (lim === 0) return min;
        return min === 0 ? lim : Math.min(min, lim);
      }, 0)
    : getCharLimit(activeChannel);

  const optimalLimit = isMainTab ? 0 : getOptimalLimit(activeChannel);
  const charCount = currentBody.length;
  const placeholder = getPlaceholder(isMainTab, activeChannel?.name, flowState);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 280)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [currentBody, autoResize]);

  const handleBodyChange = (value: string) => {
    if (isMainTab) {
      onMainBodyChange(value);
    } else if (activeTab) {
      onPlatformBodyChange(activeTab, value);
    }
  };

  // Active tab indicator position tracking
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!tabsRef.current) return;
    const activeBtn = tabsRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab, selectedChannels]);

  return (
    <div className="rounded-2xl overflow-hidden animate-fade-in relative editor-surface">
      {/* Layered ambient glows — top spotlight + edge highlights */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: `
            radial-gradient(ellipse 80% 40% at 50% -5%, rgba(255,214,10,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 50% 80% at 0% 50%, rgba(255,255,255,0.01) 0%, transparent 50%),
            radial-gradient(ellipse 50% 80% at 100% 50%, rgba(255,255,255,0.008) 0%, transparent 50%)
          `,
        }}
      />
      {/* Accent line at top of card */}
      <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent" />

      {/* ─── Header slot (platform selector) ─── */}
      {headerSlot && (
        <div className="relative px-5 pt-4 pb-3 border-b border-white/[0.03]">{headerSlot}</div>
      )}

      {/* ─── Platform tabs (segmented control style) ─── */}
      {showTabs && (
        <div className="relative border-b border-border-subtle bg-surface-1/40 px-1 pt-1">
          <div
            ref={tabsRef}
            className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin relative"
          >
            {/* Sliding indicator */}
            <div
              className={`absolute bottom-0 h-[2px] rounded-full transition-all duration-300 ease-spring ${
                isMainTab
                  ? 'bg-accent'
                  : activeChannel
                    ? getTabColor(activeChannel.slug).indicator
                    : 'bg-accent'
              }`}
              style={indicatorStyle}
            />

            <button
              type="button"
              data-active={isMainTab}
              onClick={() => onTabChange(null)}
              className={`relative px-3 py-2 text-xs font-heading font-semibold transition-all duration-200 rounded-t-lg ${
                isMainTab
                  ? 'text-accent bg-accent/5'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2/30'
              }`}
            >
              Main
            </button>
            {selectedChannels.map((ch) => {
              const tabColor = getTabColor(ch.slug);
              const isActive = activeTab === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  data-active={isActive}
                  onClick={() => onTabChange(ch.id)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-xs font-heading font-semibold transition-all duration-200 rounded-t-lg whitespace-nowrap ${
                    isActive
                      ? `${tabColor.active} ${tabColor.bg}`
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2/30'
                  }`}
                >
                  <span className="text-sm leading-none">{ch.icon}</span>
                  <span>{ch.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Editor body ─── */}
      <div className="relative px-6 py-6 md:px-8">
        {/* Vertical character progress */}
        <VerticalProgress count={charCount} limit={charLimit} optimal={optimalLimit} />

        {/* Left accent rail — editorial touch */}
        <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-accent/25 via-accent/8 to-transparent" />

        {/* Title input — editorial serif */}
        {showTitle && (
          <>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Give it a title..."
              className="mb-4 w-full bg-transparent border-none text-2xl md:text-3xl font-display text-text-primary placeholder:text-text-tertiary/30 placeholder:italic focus:outline-none tracking-tight leading-tight"
            />
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-accent/30 via-accent/10 to-transparent" />
              <div className="h-1 w-1 rounded-full bg-accent/30" />
              <div className="h-px w-12 bg-accent/10" />
            </div>
          </>
        )}

        {/* Body textarea — editorial serif for reading feel */}
        <div className="relative">
          {isAdapting && (
            <div
              className="pointer-events-none absolute inset-0 rounded-lg animate-shimmer"
              style={{
                background:
                  'linear-gradient(90deg, transparent 25%, rgba(255,214,10,0.05) 50%, transparent 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s infinite',
              }}
            />
          )}
          <textarea
            ref={textareaRef}
            value={currentBody}
            onChange={(e) => handleBodyChange(e.target.value)}
            onInput={autoResize}
            placeholder={placeholder}
            className="w-full bg-transparent border-none text-text-primary font-editor text-base leading-[1.8] placeholder:text-text-tertiary/40 placeholder:font-sans placeholder:text-sm focus:outline-none resize-none relative z-[1] pr-3"
            style={{ minHeight: '280px' }}
          />
        </div>

        {/* Image preview */}
        {imageUrl && (
          <button
            type="button"
            onClick={onImageClick}
            className="mt-3 group relative overflow-hidden rounded-xl border border-border-subtle hover:border-border-hover transition-all duration-200"
          >
            <img
              src={imageUrl}
              alt="Attached"
              className="h-24 w-auto object-cover transition-all duration-200 group-hover:opacity-70 group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Image className="h-5 w-5 text-text-primary" />
            </span>
          </button>
        )}

        {/* Media slot — renders inline inside the editor card */}
        {mediaSlot && <div className="mt-4 pt-3 border-t border-border-subtle/50">{mediaSlot}</div>}
      </div>

      {/* ─── Bottom bar: char counter + adapt ─── */}
      <div className="border-t border-border-subtle bg-surface-1/40 px-5 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium tabular-nums ${getCountColor(charCount, charLimit, optimalLimit)}`}
            >
              {formatCount(charCount, charLimit, optimalLimit)}
              {charLimit === 0 && <span className="ml-1 text-text-tertiary">chars</span>}
            </span>
            {optimalLimit > 0 && (
              <span className="text-[10px] text-text-tertiary tabular-nums">
                {optimalLimit.toLocaleString()} optimal &middot; {charLimit.toLocaleString()} max
              </span>
            )}
            {optimalLimit <= 0 && charLimit > 0 && (
              <span className="text-[10px] text-text-tertiary tabular-nums">
                / {charLimit.toLocaleString()} max
              </span>
            )}
          </div>

          {isMainTab && selectedChannels.length >= 2 && (
            <button
              type="button"
              onClick={onAdaptAll}
              disabled={isAdapting || !mainBody.trim()}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3.5 py-1.5 text-xs font-heading font-semibold text-text-inverse transition-all duration-200 ease-spring hover:from-accent-hover hover:to-amber-500 hover:scale-[1.02] hover:shadow-glow-accent active:scale-[0.98] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${
                !isAdapting && mainBody.trim() ? 'shadow-glow' : ''
              }`}
            >
              {isAdapting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isAdapting ? 'Adapting...' : 'Adapt All'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
