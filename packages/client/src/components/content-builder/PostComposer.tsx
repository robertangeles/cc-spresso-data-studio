import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Image, Loader2, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { api } from '../../lib/api';

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
  // Pinterest per-post fields
  pinterestBoardId?: string;
  onPinterestBoardChange?: (boardId: string, boardName: string) => void;
  pinterestLink?: string;
  onPinterestLinkChange?: (link: string) => void;
}

/** Slugs that typically use a title field */
const TITLE_SLUGS = new Set(['blog', 'youtube', 'email', 'newsletter', 'article']);

/** Platform-specific tab colors */
const TAB_COLORS: Record<string, { active: string; border: string; bg: string }> = {
  twitter: { active: 'text-blue-400', border: 'border-blue-400', bg: 'bg-blue-400/5' },
  linkedin: { active: 'text-blue-500', border: 'border-blue-500', bg: 'bg-blue-500/5' },
  instagram: { active: 'text-pink-500', border: 'border-pink-500', bg: 'bg-pink-500/5' },
  facebook: { active: 'text-blue-600', border: 'border-blue-600', bg: 'bg-blue-600/5' },
  pinterest: { active: 'text-red-500', border: 'border-red-500', bg: 'bg-red-500/5' },
  tiktok: { active: 'text-cyan-400', border: 'border-cyan-400', bg: 'bg-cyan-400/5' },
  threads: { active: 'text-gray-300', border: 'border-gray-300', bg: 'bg-gray-300/5' },
  bluesky: { active: 'text-sky-400', border: 'border-sky-400', bg: 'bg-sky-400/5' },
  youtube: { active: 'text-red-600', border: 'border-red-600', bg: 'bg-red-600/5' },
  blog: { active: 'text-emerald-400', border: 'border-emerald-400', bg: 'bg-emerald-400/5' },
  email: { active: 'text-amber-400', border: 'border-amber-400', bg: 'bg-amber-400/5' },
};

const DEFAULT_TAB_COLOR = { active: 'text-accent', border: 'border-accent', bg: 'bg-accent/5' };

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

/** Two-zone progress bar: green up to optimal, yellow to max, red past max */
function renderDualBar(count: number, limit: number, optimal: number) {
  if (limit === 0) return null;

  if (optimal <= 0 || optimal >= limit) {
    // Single-zone fallback
    const pct = Math.min((count / limit) * 100, 100);
    const color =
      count > limit ? 'bg-red-400' : count / limit > 0.7 ? 'bg-amber-400' : 'bg-green-400';
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  const optPct = (optimal / limit) * 100;
  const fillPct = Math.min((count / limit) * 100, 100);
  const overflowPct = count > limit ? Math.min(((count - limit) / limit) * 100, 10) : 0;

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      {/* Optimal zone marker */}
      <div
        className="absolute top-0 h-full w-px bg-text-tertiary/40"
        style={{ left: `${optPct}%` }}
      />
      {/* Fill bar */}
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          count > limit ? 'bg-red-400' : count > optimal ? 'bg-amber-400' : 'bg-green-400'
        }`}
        style={{ width: `${fillPct + overflowPct}%` }}
      />
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
      return "Keep going... Select platforms above when you're ready to adapt.";
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
  pinterestBoardId = '',
  onPinterestBoardChange,
  pinterestLink = '',
  onPinterestLinkChange,
}: PostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMainTab = activeTab === null;
  const showTabs = selectedChannels.length >= 2;

  const activeChannel = selectedChannels.find((ch) => ch.id === activeTab);
  const showTitle = isMainTab || (activeChannel && TITLE_SLUGS.has(activeChannel.slug));

  // Determine the current body text
  const currentBody = isMainTab
    ? mainBody
    : activeTab
      ? (platformBodies[activeTab] ?? '')
      : mainBody;

  // Determine char limit for counter
  const charLimit = isMainTab
    ? selectedChannels.reduce((min, ch) => {
        const lim = getCharLimit(ch);
        if (lim === 0) return min; // unlimited doesn't restrict
        return min === 0 ? lim : Math.min(min, lim);
      }, 0)
    : getCharLimit(activeChannel);

  // Optimal char limit (platform-specific sweet spot)
  const optimalLimit = isMainTab ? 0 : getOptimalLimit(activeChannel);

  const charCount = currentBody.length;

  // Contextual placeholder
  const placeholder = getPlaceholder(isMainTab, activeChannel?.name, flowState);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 300)}px`;
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

  return (
    <div className="rounded-xl border border-border-subtle bg-gradient-to-b from-surface-1 to-surface-2 p-4 flex-1 flex flex-col">
      {/* Platform tabs */}
      {showTabs && (
        <div className="mb-4 flex items-center gap-1 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => onTabChange(null)}
            className={`px-3 py-2 text-sm font-medium transition-all duration-200 rounded-t-md ${
              isMainTab
                ? 'border-b-2 border-accent text-accent bg-accent/5'
                : 'text-text-tertiary hover:text-text-secondary'
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
                onClick={() => onTabChange(ch.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-t-md ${
                  isActive
                    ? `border-b-2 ${tabColor.border} ${tabColor.active} ${tabColor.bg}`
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <span className="text-base leading-none">{ch.icon}</span>
                <span>{ch.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Title input */}
      {showTitle && (
        <>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Post title…"
            className="mb-3 w-full bg-transparent border-none text-xl font-semibold text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {/* Gradient separator between title and body */}
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
        </>
      )}

      {/* Pinterest-specific fields (shown when Pinterest tab is active) */}
      {activeChannel?.slug === 'pinterest' && (
        <PinterestFields
          boardId={pinterestBoardId}
          onBoardChange={onPinterestBoardChange}
          link={pinterestLink}
          onLinkChange={onPinterestLinkChange}
          hasImage={!!imageUrl}
        />
      )}

      {/* Body textarea */}
      <div className="relative flex-1 flex flex-col">
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
          className="w-full flex-1 bg-transparent border-none text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none relative z-[1] shadow-inner shadow-black/20 rounded-lg p-1"
          style={{ minHeight: '200px' }}
        />
      </div>

      {/* Image preview */}
      {imageUrl && (
        <button
          type="button"
          onClick={onImageClick}
          className="mt-3 group relative overflow-hidden rounded-lg border border-border-subtle"
        >
          <img
            src={imageUrl}
            alt="Attached"
            className="h-24 w-auto object-cover transition-opacity duration-200 group-hover:opacity-70"
          />
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Image className="h-5 w-5 text-text-primary" />
          </span>
        </button>
      )}

      {/* Bottom bar: char counter + adapt button */}
      <div className="mt-4 space-y-2">
        {/* Dual-zone progress bar */}
        {charLimit > 0 && renderDualBar(charCount, charLimit, optimalLimit)}

        <div className="flex items-center justify-between">
          {/* Character counter with optimal zone */}
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

          {/* Adapt All button — only on Main tab with 2+ channels */}
          {isMainTab && selectedChannels.length >= 2 && (
            <button
              type="button"
              onClick={onAdaptAll}
              disabled={isAdapting || !mainBody.trim()}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-text-inverse transition-all duration-200 ease-spring hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                !isAdapting && mainBody.trim() ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''
              }`}
            >
              {isAdapting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isAdapting ? 'Adapting…' : 'Adapt All'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Pinterest-specific fields ---

function PinterestFields({
  boardId,
  onBoardChange,
  link,
  onLinkChange,
  hasImage,
}: {
  boardId: string;
  onBoardChange?: (boardId: string, boardName: string) => void;
  link: string;
  onLinkChange?: (link: string) => void;
  hasImage: boolean;
}) {
  const [boards, setBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    api
      .get('/oauth/pinterest/boards')
      .then(({ data }) => setBoards(data.data ?? []))
      .catch(() => setBoards([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      {/* Image warning */}
      {!hasImage && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Pinterest requires an image. Add one in Media Studio.</span>
        </div>
      )}

      {/* Board selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary whitespace-nowrap">
          Board <span className="text-red-400">*</span>
        </label>
        <select
          value={boardId}
          onChange={(e) => {
            const board = boards.find((b) => b.id === e.target.value);
            onBoardChange?.(e.target.value, board?.name ?? '');
          }}
          className="flex-1 rounded-md border border-border-default bg-surface-3 px-2 py-1 text-xs text-text-primary
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        >
          <option value="">
            {isLoading ? 'Loading...' : boards.length === 0 ? 'No boards found' : 'Select board...'}
          </option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
      </div>

      {/* Link field */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary whitespace-nowrap">
          <LinkIcon className="h-3 w-3 inline mr-1" />
          Link
        </label>
        <input
          type="url"
          value={link}
          onChange={(e) => onLinkChange?.(e.target.value)}
          placeholder="https://your-site.com/article"
          className="flex-1 rounded-md border border-border-default bg-surface-3 px-2 py-1 text-xs text-text-primary
                     placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>
    </div>
  );
}
