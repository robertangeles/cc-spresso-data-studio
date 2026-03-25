import { Monitor, Heart, MessageCircle, Repeat2, Share, ThumbsUp, Bookmark } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: any;
}

interface PlatformPreviewProps {
  selectedChannels: Channel[];
  title: string;
  mainBody: string;
  platformBodies: Record<string, string>;
  imageUrl: string | null;
  userName: string;
}

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  instagram: 2200,
  threads: 500,
  bluesky: 300,
  blog: 50000,
  email: 50000,
  youtube: 5000,
};

/** Platform accent colors for top border bar */
const PLATFORM_TOP_BORDER: Record<string, string> = {
  twitter:   'bg-blue-400',
  linkedin:  'bg-blue-500',
  instagram: 'bg-pink-500',
  facebook:  'bg-blue-600',
  pinterest: 'bg-red-500',
  tiktok:    'bg-cyan-400',
  threads:   'bg-gray-300',
  bluesky:   'bg-sky-400',
  youtube:   'bg-red-600',
  blog:      'bg-emerald-400',
  email:     'bg-amber-400',
};

const PLATFORM_ICON_COLOR: Record<string, string> = {
  twitter:   'text-blue-400',
  linkedin:  'text-blue-500',
  instagram: 'text-pink-500',
  facebook:  'text-blue-600',
  pinterest: 'text-red-500',
  tiktok:    'text-cyan-400',
  threads:   'text-gray-300',
  bluesky:   'text-sky-400',
  youtube:   'text-red-600',
  blog:      'text-emerald-400',
  email:     'text-amber-400',
};

function getBody(slug: string, platformBodies: Record<string, string>, mainBody: string): string {
  return platformBodies[slug] || mainBody;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

function UserAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full bg-accent-dim flex items-center justify-center text-xs font-bold text-accent shrink-0">
      {initial}
    </div>
  );
}

/* ---------- Ghost skeleton for empty state — platform-style mockups ---------- */

/** Twitter-style ghost: avatar, 2 text lines, image placeholder */
function GhostTwitterCard() {
  return (
    <div
      className="bg-surface-2/40 rounded-xl border border-border-subtle/30 overflow-hidden opacity-30 animate-slide-up"
      style={{ animationDelay: '0ms', animationFillMode: 'both', animation: 'pulse 3s ease-in-out infinite, slide-up 0.3s ease-out both' }}
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
        <div className="h-24 w-full rounded-lg bg-surface-3/20" />
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

/** LinkedIn-style ghost: header bar, 3 text lines, reaction dots */
function GhostLinkedInCard() {
  return (
    <div
      className="bg-surface-2/40 rounded-xl border border-border-subtle/30 overflow-hidden opacity-30 animate-slide-up"
      style={{ animationDelay: '100ms', animationFillMode: 'both', animation: 'pulse 3s ease-in-out 0.5s infinite, slide-up 0.3s ease-out 100ms both' }}
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
        <div className="border-t border-border-subtle/30 pt-2 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-blue-500/20" />
          <div className="h-2 w-2 rounded-full bg-red-500/20" />
          <div className="h-2 w-2 rounded-full bg-amber-400/20" />
          <div className="h-2 w-10 rounded-full bg-surface-3/25 ml-1" />
        </div>
      </div>
    </div>
  );
}

/** Instagram-style ghost: square image placeholder, caption bar */
function GhostInstagramCard() {
  return (
    <div
      className="bg-surface-2/40 rounded-xl border border-border-subtle/30 overflow-hidden opacity-30 animate-slide-up"
      style={{ animationDelay: '200ms', animationFillMode: 'both', animation: 'pulse 3s ease-in-out 1s infinite, slide-up 0.3s ease-out 200ms both' }}
    >
      <div className="h-[3px] bg-pink-500/40" />
      <div className="aspect-[4/3] bg-surface-3/20 flex items-center justify-center">
        <div className="h-10 w-10 rounded-lg bg-surface-3/30" />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-4">
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30" />
          <div className="h-3 w-3 rounded-full bg-surface-3/30 ml-auto" />
        </div>
        <div className="h-2.5 w-3/4 rounded-full bg-surface-3/30" />
      </div>
    </div>
  );
}

/* ---------- Platform-specific preview renderers ---------- */

function TwitterPreview({ body, imageUrl, userName }: { body: string; imageUrl: string | null; userName: string }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-2.5">
        <UserAvatar name={userName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary truncate">{userName}</span>
            <span className="text-xs text-text-tertiary">@{userName.toLowerCase().replace(/\s/g, '')}</span>
          </div>
          <p className="text-sm text-text-secondary whitespace-pre-wrap mt-1">{truncate(body, 280)}</p>
          {imageUrl && (
            <img src={imageUrl} alt="" className="mt-2 rounded-xl border border-border-subtle w-full object-cover max-h-48" />
          )}
          <div className="flex items-center gap-6 mt-2.5 text-text-tertiary">
            <MessageCircle className="h-3.5 w-3.5" />
            <Repeat2 className="h-3.5 w-3.5" />
            <Heart className="h-3.5 w-3.5" />
            <Share className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({ body, imageUrl, userName }: { body: string; imageUrl: string | null; userName: string }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-2.5">
        <UserAvatar name={userName} />
        <div>
          <p className="text-sm font-semibold text-text-primary">{userName}</p>
          <p className="text-[10px] text-text-tertiary">Content Creator</p>
        </div>
      </div>
      <p className="text-sm text-text-secondary whitespace-pre-wrap">{truncate(body, 700)}</p>
      {imageUrl && (
        <img src={imageUrl} alt="" className="rounded-lg border border-border-subtle w-full object-cover max-h-48" />
      )}
      <div className="flex items-center gap-4 pt-2 border-t border-border-subtle text-text-tertiary text-xs">
        <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</span>
        <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> Repost</span>
        <span className="flex items-center gap-1"><Share className="h-3.5 w-3.5" /> Send</span>
      </div>
    </div>
  );
}

function InstagramPreview({ body, imageUrl, userName }: { body: string; imageUrl: string | null; userName: string }) {
  return (
    <div>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-surface-3 flex items-center justify-center text-text-tertiary text-xs">
          No image
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-4 text-text-primary">
          <Heart className="h-4 w-4" />
          <MessageCircle className="h-4 w-4" />
          <Share className="h-4 w-4" />
          <Bookmark className="h-4 w-4 ml-auto" />
        </div>
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary mr-1">{userName.toLowerCase().replace(/\s/g, '')}</span>
          {truncate(body, 150)}
        </p>
      </div>
    </div>
  );
}

function SimpleTextPreview({ body, userName }: { body: string; userName: string; slug?: string }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-2.5 items-center">
        <UserAvatar name={userName} />
        <span className="text-sm font-semibold text-text-primary">{userName}</span>
      </div>
      <p className="text-sm text-text-secondary whitespace-pre-wrap">{truncate(body, 500)}</p>
    </div>
  );
}

function TitledPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-3 space-y-2">
      {title && <h3 className="text-sm font-semibold text-text-primary">{title}</h3>}
      <p className="text-sm text-text-secondary whitespace-pre-wrap line-clamp-6">{body}</p>
    </div>
  );
}

/* ---------- Main component ---------- */

export function PlatformPreview({
  selectedChannels,
  title,
  mainBody,
  platformBodies,
  imageUrl,
  userName,
}: PlatformPreviewProps) {
  if (selectedChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <Monitor className="h-8 w-8 text-text-tertiary mb-3" />
        <p className="text-sm text-text-tertiary mb-6">Select platforms to see previews</p>
        {/* Ghost skeleton previews — platform-style mockups */}
        <div className="relative w-full space-y-3">
          <GhostTwitterCard />
          <GhostLinkedInCard />
          <GhostInstagramCard />
          {/* Centered overlay prompt */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="bg-surface-1/80 backdrop-blur-sm rounded-xl px-5 py-3 border border-border-subtle/50 shadow-dark-lg">
              <svg className="h-4 w-4 text-accent mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
              <p className="text-xs font-medium text-text-secondary">Select platforms above</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto scrollbar-thin p-3">
      {selectedChannels.map((channel) => {
        const body = getBody(channel.slug, platformBodies, mainBody);
        const limit = CHAR_LIMITS[channel.slug] ?? 5000;
        const charCount = body.length;
        const topBorderColor = PLATFORM_TOP_BORDER[channel.slug] ?? 'bg-accent';
        const iconColor = PLATFORM_ICON_COLOR[channel.slug] ?? 'text-accent';

        return (
          <div
            key={channel.id}
            className="bg-surface-2 rounded-xl border border-border-subtle overflow-hidden transition-all duration-200 hover:-translate-y-[2px] hover:shadow-dark-lg"
          >
            {/* Colored top border bar */}
            <div className={`h-[3px] ${topBorderColor}`} />

            {/* Card header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className={`text-base ${iconColor}`}>{channel.icon}</span>
                <span className="text-xs font-medium text-text-primary">{channel.name}</span>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  charCount > limit
                    ? 'bg-status-error-dim text-status-error'
                    : 'bg-surface-3 text-text-tertiary'
                }`}
              >
                {charCount}/{limit}
              </span>
            </div>

            {/* Platform-specific content */}
            {channel.slug === 'twitter' && (
              <TwitterPreview body={body} imageUrl={imageUrl} userName={userName} />
            )}
            {channel.slug === 'linkedin' && (
              <LinkedInPreview body={body} imageUrl={imageUrl} userName={userName} />
            )}
            {channel.slug === 'instagram' && (
              <InstagramPreview body={body} imageUrl={imageUrl} userName={userName} />
            )}
            {(channel.slug === 'threads' || channel.slug === 'bluesky') && (
              <SimpleTextPreview body={body} userName={userName} slug={channel.slug} />
            )}
            {(channel.slug === 'blog' || channel.slug === 'email' || channel.slug === 'youtube') && (
              <TitledPreview title={title} body={body} />
            )}
            {/* Fallback for unknown platforms */}
            {!['twitter', 'linkedin', 'instagram', 'threads', 'bluesky', 'blog', 'email', 'youtube'].includes(channel.slug) && (
              <SimpleTextPreview body={body} userName={userName} slug={channel.slug} />
            )}
          </div>
        );
      })}
    </div>
  );
}
