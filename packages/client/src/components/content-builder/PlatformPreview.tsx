import { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  ThumbsUp,
  Bookmark,
  Sparkles,
  Send,
  Play,
} from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: Record<string, unknown>;
}

interface PlatformPreviewProps {
  selectedChannels: Channel[];
  title: string;
  mainBody: string;
  platformBodies: Record<string, string>;
  imageUrl: string | null;
  userName: string;
  isAdapting?: boolean;
  onCardClick?: (channelId: string) => void;
}

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  instagram: 2200,
  facebook: 63000,
  threads: 500,
  bluesky: 300,
  tiktok: 4000,
  pinterest: 500,
  blog: 50000,
  email: 50000,
  youtube: 5000,
};

/** Platform accent colors for top border bar */
const PLATFORM_TOP_BORDER: Record<string, string> = {
  twitter: 'bg-blue-400',
  linkedin: 'bg-blue-500',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400',
  facebook: 'bg-blue-600',
  pinterest: 'bg-red-500',
  tiktok: 'bg-gradient-to-r from-cyan-400 to-pink-500',
  threads: 'bg-gray-300',
  bluesky: 'bg-sky-400',
  youtube: 'bg-red-600',
  blog: 'bg-emerald-400',
  email: 'bg-amber-400',
};

const PLATFORM_ICON_COLOR: Record<string, string> = {
  twitter: 'text-blue-400',
  linkedin: 'text-blue-500',
  instagram: 'text-pink-500',
  facebook: 'text-blue-600',
  pinterest: 'text-red-500',
  tiktok: 'text-cyan-400',
  threads: 'text-gray-300',
  bluesky: 'text-sky-400',
  youtube: 'text-red-600',
  blog: 'text-emerald-400',
  email: 'text-amber-400',
};

/** Platform card background colors for realism */
const PLATFORM_BG: Record<string, string> = {
  twitter: '#16181C',
  linkedin: '#1B1F23',
  instagram: '#121212',
  facebook: '#18191A',
  threads: '#101010',
  bluesky: '#14171A',
  tiktok: '#121212',
  pinterest: '#1A1A1A',
  youtube: '#0F0F0F',
  blog: '#151518',
  email: '#151518',
};

// NOTE: platformBodies is keyed by channel.id, not channel.slug
function getBody(
  channelId: string,
  platformBodies: Record<string, string>,
  mainBody: string,
): string {
  return platformBodies[channelId] || mainBody;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '\u2026';
}

function UserAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = name.charAt(0).toUpperCase();
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-8 w-8 text-xs';
  return (
    <div
      className={`${sizeClass} rounded-full bg-accent-dim flex items-center justify-center font-bold text-accent shrink-0`}
    >
      {initial}
    </div>
  );
}

/* ---------- Ghost skeleton for empty state ---------- */

function GhostTwitterCard() {
  return (
    <div
      className="bg-[#16181C] rounded-xl overflow-hidden opacity-30"
      style={{ animation: 'pulse 3s ease-in-out infinite, slide-up 0.3s ease-out both' }}
    >
      <div className="h-[3px] bg-blue-400/40" />
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-surface-3/50 shrink-0" />
          <div className="space-y-1 flex-1">
            <div className="h-2.5 w-20 rounded-full bg-surface-3/40" />
            <div className="h-2 w-14 rounded-full bg-surface-3/30" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full bg-surface-3/30" />
          <div className="h-2.5 w-3/4 rounded-full bg-surface-3/30" />
        </div>
        <div className="flex items-center gap-6 pt-1">
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
        </div>
      </div>
    </div>
  );
}

function GhostLinkedInCard() {
  return (
    <div
      className="bg-[#1B1F23] rounded-xl overflow-hidden opacity-30"
      style={{ animation: 'pulse 3s ease-in-out 0.5s infinite, slide-up 0.3s ease-out 100ms both' }}
    >
      <div className="h-[3px] bg-blue-500/40" />
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-surface-3/50 shrink-0" />
          <div className="space-y-1">
            <div className="h-2.5 w-24 rounded-full bg-surface-3/40" />
            <div className="h-2 w-16 rounded-full bg-surface-3/25" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full bg-surface-3/30" />
          <div className="h-2.5 w-5/6 rounded-full bg-surface-3/30" />
          <div className="h-2.5 w-2/3 rounded-full bg-surface-3/30" />
        </div>
      </div>
    </div>
  );
}

function GhostInstagramCard() {
  return (
    <div
      className="bg-[#121212] rounded-xl overflow-hidden opacity-30"
      style={{ animation: 'pulse 3s ease-in-out 1s infinite, slide-up 0.3s ease-out 200ms both' }}
    >
      <div className="h-[3px] bg-gradient-to-r from-purple-500/40 via-pink-500/40 to-orange-400/40" />
      <div className="aspect-[4/3] bg-surface-3/20 flex items-center justify-center">
        <div className="h-10 w-10 rounded-lg bg-surface-3/30" />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-4">
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
        </div>
        <div className="h-2.5 w-3/4 rounded-full bg-surface-3/30" />
      </div>
    </div>
  );
}

/* ---------- Platform-specific preview renderers ---------- */

function TwitterPreview({
  body,
  imageUrl,
  userName,
}: {
  body: string;
  imageUrl: string | null;
  userName: string;
}) {
  const handle = userName.toLowerCase().replace(/\s/g, '');
  return (
    <div className="p-3.5 space-y-2">
      <div className="flex gap-3">
        <UserAvatar name={userName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-white truncate">{userName}</span>
            <span className="text-[13px] text-[#71767B]">@{handle} · 1m</span>
          </div>
          <p className="text-[14px] text-[#E7E9EA] leading-[1.35] whitespace-pre-wrap mt-0.5">
            {truncate(body, 280)}
          </p>
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="mt-2.5 rounded-2xl border border-[#2F3336] w-full object-cover max-h-48"
            />
          )}
          <div className="flex items-center justify-between mt-3 text-[#71767B] max-w-[80%]">
            <MessageCircle className="h-[15px] w-[15px]" />
            <Repeat2 className="h-[15px] w-[15px]" />
            <Heart className="h-[15px] w-[15px]" />
            <Share className="h-[15px] w-[15px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({
  body,
  imageUrl,
  userName,
}: {
  body: string;
  imageUrl: string | null;
  userName: string;
}) {
  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex gap-2.5">
        <UserAvatar name={userName} />
        <div>
          <p className="text-[13px] font-semibold text-white">{userName}</p>
          <p className="text-[11px] text-[#FFFFFFB3] leading-tight">Content Creator · 1h</p>
        </div>
      </div>
      <p className="text-[13px] text-[#FFFFFFE6] leading-[1.45] whitespace-pre-wrap">
        {truncate(body, 700)}
      </p>
      {imageUrl && (
        <img src={imageUrl} alt="" className="rounded-lg w-full object-cover max-h-48" />
      )}
      <div className="flex items-center gap-5 pt-2.5 border-t border-[#FFFFFF1A] text-[#FFFFFFB3] text-[11px]">
        <span className="flex items-center gap-1.5 hover:text-white cursor-default">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </span>
        <span className="flex items-center gap-1.5 hover:text-white cursor-default">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </span>
        <span className="flex items-center gap-1.5 hover:text-white cursor-default">
          <Repeat2 className="h-3.5 w-3.5" /> Repost
        </span>
        <span className="flex items-center gap-1.5 hover:text-white cursor-default">
          <Send className="h-3.5 w-3.5" /> Send
        </span>
      </div>
    </div>
  );
}

function InstagramPreview({
  body,
  imageUrl,
  userName,
}: {
  body: string;
  imageUrl: string | null;
  userName: string;
}) {
  const handle = userName.toLowerCase().replace(/\s/g, '');
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <UserAvatar name={userName} size="sm" />
        <span className="text-[12px] font-semibold text-white">{handle}</span>
      </div>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-[4/3] bg-[#1A1A1A] flex items-center justify-center text-text-tertiary/30">
          <svg
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      <div className="px-3.5 py-2.5 space-y-1.5">
        <div className="flex items-center gap-4 text-white">
          <Heart className="h-[22px] w-[22px]" />
          <MessageCircle className="h-[22px] w-[22px]" />
          <Send className="h-[22px] w-[22px]" />
          <Bookmark className="h-[22px] w-[22px] ml-auto" />
        </div>
        <p className="text-[13px] text-[#F5F5F5]">
          <span className="font-semibold mr-1.5">{handle}</span>
          {truncate(body, 150)}
        </p>
      </div>
    </div>
  );
}

function FacebookPreview({
  body,
  imageUrl,
  userName,
}: {
  body: string;
  imageUrl: string | null;
  userName: string;
}) {
  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex gap-2.5">
        <UserAvatar name={userName} />
        <div>
          <p className="text-[13px] font-semibold text-white">{userName}</p>
          <p className="text-[11px] text-[#B0B3B8]">Just now · 🌐</p>
        </div>
      </div>
      <p className="text-[14px] text-[#E4E6EB] leading-[1.4] whitespace-pre-wrap">
        {truncate(body, 500)}
      </p>
      {imageUrl && (
        <img src={imageUrl} alt="" className="rounded-lg w-full object-cover max-h-48" />
      )}
      <div className="flex items-center justify-between pt-2.5 border-t border-[#3E4042] text-[#B0B3B8] text-[12px]">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="h-4 w-4" /> Like
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" /> Comment
        </span>
        <span className="flex items-center gap-1.5">
          <Share className="h-4 w-4" /> Share
        </span>
      </div>
    </div>
  );
}

function TikTokPreview({ body, userName }: { body: string; userName: string }) {
  const handle = userName.toLowerCase().replace(/\s/g, '');
  return (
    <div className="relative">
      <div className="aspect-[9/12] bg-[#000] rounded-lg flex items-end">
        <div className="p-3.5 space-y-2 w-full bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
          <div className="flex items-center gap-2">
            <UserAvatar name={userName} size="sm" />
            <span className="text-[12px] font-bold text-white">@{handle}</span>
          </div>
          <p className="text-[12px] text-white/90 leading-tight">{truncate(body, 150)}</p>
        </div>
      </div>
      {/* Side actions */}
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Bookmark className="h-5 w-5" />
        <Share className="h-5 w-5" />
      </div>
    </div>
  );
}

function PinterestPreview({
  body,
  imageUrl,
  userName,
}: {
  body: string;
  imageUrl: string | null;
  userName: string;
}) {
  return (
    <div>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full aspect-[2/3] object-cover rounded-t-xl" />
      ) : (
        <div className="w-full aspect-[2/3] bg-[#222] flex items-center justify-center rounded-t-xl text-text-tertiary/30">
          <svg
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <p className="text-[13px] text-white font-semibold line-clamp-2">{truncate(body, 100)}</p>
        <div className="flex items-center gap-1.5">
          <UserAvatar name={userName} size="sm" />
          <span className="text-[11px] text-[#B0B3B8]">{userName}</span>
        </div>
      </div>
    </div>
  );
}

function YouTubePreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="aspect-video bg-[#0F0F0F] flex items-center justify-center rounded-t-xl">
        <div className="h-12 w-12 rounded-full bg-red-600/80 flex items-center justify-center">
          <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
        </div>
      </div>
      <div className="px-3.5 pb-3 space-y-1">
        <h4 className="text-[13px] font-semibold text-white line-clamp-2">
          {title || 'Video Title'}
        </h4>
        <p className="text-[11px] text-[#AAAAAA] line-clamp-2">{truncate(body, 200)}</p>
      </div>
    </div>
  );
}

function SimpleTextPreview({ body, userName }: { body: string; userName: string }) {
  return (
    <div className="p-3.5 space-y-2">
      <div className="flex gap-2.5 items-center">
        <UserAvatar name={userName} />
        <span className="text-[13px] font-semibold text-white">{userName}</span>
      </div>
      <p className="text-[13px] text-[#E7E9EA] whitespace-pre-wrap leading-[1.4]">
        {truncate(body, 500)}
      </p>
    </div>
  );
}

function TitledPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-3.5 space-y-2">
      {title && <h3 className="text-[14px] font-bold text-white">{title}</h3>}
      <p className="text-[13px] text-[#CCCCCC] whitespace-pre-wrap line-clamp-6 leading-[1.5]">
        {body}
      </p>
    </div>
  );
}

/* ---------- Renderer dispatch ---------- */

function PlatformRenderer({
  slug,
  body,
  title,
  imageUrl,
  userName,
}: {
  slug: string;
  body: string;
  title: string;
  imageUrl: string | null;
  userName: string;
}) {
  switch (slug) {
    case 'twitter':
      return <TwitterPreview body={body} imageUrl={imageUrl} userName={userName} />;
    case 'linkedin':
      return <LinkedInPreview body={body} imageUrl={imageUrl} userName={userName} />;
    case 'instagram':
      return <InstagramPreview body={body} imageUrl={imageUrl} userName={userName} />;
    case 'facebook':
      return <FacebookPreview body={body} imageUrl={imageUrl} userName={userName} />;
    case 'tiktok':
      return <TikTokPreview body={body} userName={userName} />;
    case 'pinterest':
      return <PinterestPreview body={body} imageUrl={imageUrl} userName={userName} />;
    case 'youtube':
      return <YouTubePreview title={title} body={body} />;
    case 'blog':
    case 'email':
      return <TitledPreview title={title} body={body} />;
    case 'threads':
    case 'bluesky':
      return <SimpleTextPreview body={body} userName={userName} />;
    default:
      return <SimpleTextPreview body={body} userName={userName} />;
  }
}

/* ---------- Main component ---------- */

export function PlatformPreview({
  selectedChannels,
  title,
  mainBody,
  platformBodies,
  imageUrl,
  userName,
  isAdapting = false,
  onCardClick,
}: PlatformPreviewProps) {
  // Track when adaptation just completed for animation
  const [justAdapted, setJustAdapted] = useState(false);
  const prevAdapting = useRef(isAdapting);

  useEffect(() => {
    if (prevAdapting.current && !isAdapting) {
      setJustAdapted(true);
      const timer = setTimeout(() => setJustAdapted(false), 1200);
      return () => clearTimeout(timer);
    }
    prevAdapting.current = isAdapting;
  }, [isAdapting]);

  if (selectedChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
        <Monitor className="h-7 w-7 text-text-tertiary/30 mb-2" />
        <p className="text-xs text-text-tertiary/60 mb-6">
          Select platforms above to see live previews
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
          <GhostTwitterCard />
          <GhostLinkedInCard />
          <GhostInstagramCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-accent/15 to-transparent" />
        <span className="text-[10px] font-heading font-bold text-text-tertiary/50 uppercase tracking-[0.15em]">
          Live Previews
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-accent/15 to-transparent" />
      </div>

      {/* Preview grid — responsive columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {selectedChannels.map((channel, index) => {
          const body = getBody(channel.id, platformBodies, mainBody);
          const limit = CHAR_LIMITS[channel.slug] ?? 5000;
          const charCount = body.length;
          const topBorderColor = PLATFORM_TOP_BORDER[channel.slug] ?? 'bg-accent';
          const iconColor = PLATFORM_ICON_COLOR[channel.slug] ?? 'text-accent';
          const bgColor = PLATFORM_BG[channel.slug] ?? '#151518';
          const hasAdaptedContent = !!platformBodies[channel.id];

          return (
            <div
              key={channel.id}
              onClick={() => onCardClick?.(channel.id)}
              className={`
                group rounded-xl overflow-hidden transition-all duration-300 ease-spring
                ${onCardClick ? 'cursor-pointer' : ''}
                hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]
                ${hasAdaptedContent && justAdapted ? 'animate-scale-in' : 'animate-slide-up'}
                ${isAdapting ? 'opacity-60' : 'opacity-100'}
              `}
              style={{
                backgroundColor: bgColor,
                animationDelay: `${index * 80}ms`,
                animationFillMode: 'both',
              }}
            >
              {/* Colored top border bar */}
              <div className={`h-[3px] ${topBorderColor}`} />

              {/* Shimmer overlay during adaptation */}
              {isAdapting && (
                <div
                  className="absolute inset-0 z-10 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 25%, rgba(255,214,10,0.04) 50%, transparent 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                  }}
                />
              )}

              {/* Card header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${iconColor}`}>{channel.icon}</span>
                  <span className="text-[11px] font-heading font-semibold text-white/80">
                    {channel.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasAdaptedContent && (
                    <span className="flex items-center gap-0.5 text-[9px] text-accent/80 font-semibold">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded transition-colors duration-300 ${
                      charCount > limit
                        ? 'bg-red-500/15 text-red-400'
                        : charCount > limit * 0.8
                          ? 'bg-amber-400/15 text-amber-400'
                          : charCount > 0
                            ? 'bg-white/[0.06] text-white/40'
                            : 'bg-white/[0.03] text-white/20'
                    }`}
                  >
                    {charCount}/{limit > 10000 ? '∞' : limit}
                  </span>
                </div>
              </div>

              {/* Platform-specific content with resolve animation */}
              <div
                className={`relative ${hasAdaptedContent && justAdapted ? 'content-resolve' : ''}`}
              >
                <PlatformRenderer
                  slug={channel.slug}
                  body={body}
                  title={title}
                  imageUrl={imageUrl}
                  userName={userName}
                />
              </div>

              {/* Click-to-edit hint */}
              {onCardClick && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] rounded-xl">
                  <span className="text-[11px] font-heading font-semibold text-white bg-accent/20 border border-accent/30 px-3 py-1.5 rounded-lg">
                    Click to edit
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
