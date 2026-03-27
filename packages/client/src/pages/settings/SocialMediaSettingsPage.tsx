import { useState, useEffect, useCallback } from 'react';
import { Share2, ExternalLink, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Platform definitions                                               */
/* ------------------------------------------------------------------ */

interface PlatformConfig {
  slug: string;
  name: string;
  icon: string;
  color: string; // Tailwind color token (used via inline style)
  colorHex: string; // hex fallback for inline styles
  authType: 'oauth' | 'credentials';
  description: string;
  requirements: string;
  connectUrl?: string;
  statusUrl?: string;
  disconnectUrl?: string;
  charLimit: number;
  imageRequired: boolean;
  supportedTypes: string[];
  setupSteps: string[];
  status: 'ready' | 'coming-soon';
}

const PLATFORMS: PlatformConfig[] = [
  {
    slug: 'instagram',
    name: 'Instagram',
    icon: '\uD83D\uDCF8',
    color: 'pink-500',
    colorHex: '#ec4899',
    authType: 'oauth',
    description: 'Share photos and stories with your audience',
    requirements: 'Requires Instagram Professional/Business account linked to a Facebook Page',
    connectUrl: '/api/oauth/instagram/connect',
    statusUrl: '/api/oauth/instagram/status',
    disconnectUrl: '/api/oauth/instagram/disconnect',
    charLimit: 2200,
    imageRequired: true,
    supportedTypes: ['Image posts', 'Carousels', 'Reels', 'Stories'],
    setupSteps: [
      'Convert your Instagram account to a Professional or Business account',
      'Create a Facebook Page and link it to your Instagram account',
      'Click "Connect" below to authorize Content Pilot via Meta',
    ],
    status: 'ready',
  },
  {
    slug: 'facebook',
    name: 'Facebook',
    icon: '\uD83D\uDCD8',
    color: 'blue-600',
    colorHex: '#2563eb',
    authType: 'oauth',
    description: 'Reach your Facebook audience with posts and updates',
    requirements: 'Uses the same Meta Developer App as Instagram',
    charLimit: 63206,
    imageRequired: false,
    supportedTypes: ['Text posts', 'Image posts', 'Link shares', 'Videos'],
    setupSteps: [
      'Ensure you have admin access to your Facebook Page',
      'Click "Connect" to authorize via Meta (same app as Instagram)',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'threads',
    name: 'Threads',
    icon: '\uD83E\uDDF5',
    color: 'neutral-100',
    colorHex: '#f5f5f5',
    authType: 'oauth',
    description: 'Join the conversation on Threads',
    requirements: 'Requires an Instagram account with Threads profile activated',
    charLimit: 500,
    imageRequired: false,
    supportedTypes: ['Text posts', 'Image posts', 'Quote posts'],
    setupSteps: [
      'Create a Threads profile from your Instagram account',
      'Click "Connect" to authorize via Meta',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'twitter',
    name: 'Twitter / X',
    icon: '\uD835\uDD4F',
    color: 'neutral-100',
    colorHex: '#f5f5f5',
    authType: 'oauth',
    description: 'Post tweets and threads to X',
    requirements: 'Requires a Twitter/X developer account with OAuth 2.0 credentials',
    charLimit: 280,
    imageRequired: false,
    supportedTypes: ['Tweets', 'Threads', 'Image tweets', 'Polls'],
    setupSteps: [
      'Apply for a Twitter Developer account at developer.twitter.com',
      'Create a project and app with OAuth 2.0 enabled',
      'Click "Connect" to authorize Content Pilot',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'linkedin',
    name: 'LinkedIn',
    icon: '\uD83D\uDCBC',
    color: 'blue-700',
    colorHex: '#1d4ed8',
    authType: 'oauth',
    description: 'Publish professional content to your LinkedIn network',
    requirements: 'Requires LinkedIn account with "Share on LinkedIn" permission',
    charLimit: 3000,
    imageRequired: false,
    supportedTypes: ['Text posts', 'Articles', 'Image posts', 'Document posts'],
    setupSteps: [
      'Ensure your LinkedIn profile is in good standing',
      'Click "Connect" to authorize Content Pilot via LinkedIn OAuth',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'bluesky',
    name: 'Bluesky',
    icon: '\uD83E\uDD8B',
    color: 'sky-400',
    colorHex: '#38bdf8',
    authType: 'credentials',
    description: 'Post to the open social web',
    requirements: 'Create an App Password in Bluesky Settings \u2192 Privacy \u2192 App Passwords',
    connectUrl: '/api/oauth/bluesky/connect',
    statusUrl: '/api/oauth/bluesky/status',
    disconnectUrl: '/api/oauth/bluesky/disconnect',
    charLimit: 300,
    imageRequired: false,
    supportedTypes: ['Text posts', 'Image posts', 'Quote posts', 'Links with cards'],
    setupSteps: [
      'Go to bsky.app \u2192 Settings \u2192 Privacy \u2192 App Passwords',
      'Create a new app password (name it "Content Pilot")',
      'Enter your handle and the app password below',
    ],
    status: 'ready',
  },
  {
    slug: 'tiktok',
    name: 'TikTok',
    icon: '\uD83C\uDFB5',
    color: 'pink-500',
    colorHex: '#ec4899',
    authType: 'oauth',
    description: 'Share short-form videos with a global audience',
    requirements: 'Requires a TikTok Business or Creator account',
    charLimit: 2200,
    imageRequired: false,
    supportedTypes: ['Videos', 'Photo slideshows'],
    setupSteps: [
      'Switch to a TikTok Business or Creator account',
      'Click "Connect" to authorize Content Pilot via TikTok OAuth',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'pinterest',
    name: 'Pinterest',
    icon: '\uD83D\uDCCC',
    color: 'red-600',
    colorHex: '#dc2626',
    authType: 'oauth',
    description: 'Pin visual content to reach Pinterest audiences',
    requirements: 'Requires a Pinterest Business account',
    charLimit: 500,
    imageRequired: true,
    supportedTypes: ['Pins', 'Idea Pins', 'Video Pins'],
    setupSteps: [
      'Convert to a Pinterest Business account',
      'Click "Connect" to authorize Content Pilot',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    icon: '\u25B6\uFE0F',
    color: 'red-600',
    colorHex: '#dc2626',
    authType: 'oauth',
    description: 'Upload videos and manage your YouTube channel',
    requirements: 'Requires a YouTube channel linked to a Google account',
    charLimit: 5000,
    imageRequired: false,
    supportedTypes: ['Videos', 'Shorts', 'Community posts'],
    setupSteps: [
      'Ensure you have a YouTube channel',
      'Click "Connect" to authorize via Google OAuth',
    ],
    status: 'coming-soon',
  },
];

/* ------------------------------------------------------------------ */
/*  Connection status type                                             */
/* ------------------------------------------------------------------ */

interface ConnectionStatus {
  connected: boolean;
  accountName?: string;
  accountUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export function SocialMediaSettingsPage() {
  const [activeTab, setActiveTab] = useState(PLATFORMS[0].slug);
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus | null>>({});
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const { toast } = useToast();

  const activePlatform = PLATFORMS.find((p) => p.slug === activeTab)!;

  /* Fetch connection status for a platform */
  const fetchStatus = useCallback(async (platform: PlatformConfig) => {
    if (!platform.statusUrl || platform.status === 'coming-soon') return;
    setLoadingStatus(platform.slug);
    try {
      const { data } = await api.get(platform.statusUrl);
      setStatuses((prev) => ({ ...prev, [platform.slug]: data.data ?? data }));
    } catch {
      setStatuses((prev) => ({ ...prev, [platform.slug]: { connected: false } }));
    } finally {
      setLoadingStatus(null);
    }
  }, []);

  /* Fetch on mount and tab switch */
  useEffect(() => {
    const platform = PLATFORMS.find((p) => p.slug === activeTab);
    if (platform && statuses[activeTab] === undefined) {
      fetchStatus(platform);
    }
  }, [activeTab, fetchStatus, statuses]);

  /* Disconnect handler */
  const handleDisconnect = async (platform: PlatformConfig) => {
    if (!platform.disconnectUrl) return;
    try {
      await api.post(platform.disconnectUrl);
      setStatuses((prev) => ({ ...prev, [platform.slug]: { connected: false } }));
      toast(`Disconnected from ${platform.name}`, 'success');
    } catch {
      toast(`Failed to disconnect from ${platform.name}`, 'error');
    }
  };

  /* OAuth connect handler */
  const handleOAuthConnect = (platform: PlatformConfig) => {
    if (!platform.connectUrl) return;
    window.location.href = platform.connectUrl;
  };

  const connectionStatus = statuses[activeTab] ?? null;
  const isLoading = loadingStatus === activeTab;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold text-text-primary">Social Media</h3>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Connect your social media accounts for direct publishing.
        </p>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {PLATFORMS.map((platform) => {
          const isActive = activeTab === platform.slug;
          return (
            <button
              key={platform.slug}
              onClick={() => setActiveTab(platform.slug)}
              className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:bg-surface-2 hover:text-text-secondary'
              }`}
              style={isActive ? { borderBottom: `2px solid ${platform.colorHex}` } : undefined}
            >
              <span className="text-base">{platform.icon}</span>
              <span className="hidden sm:inline">{platform.name}</span>
              {platform.status === 'coming-soon' && (
                <span className="ml-1 rounded-full bg-surface-4 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-tertiary">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active platform panel */}
      <PlatformPanel
        platform={activePlatform}
        connectionStatus={connectionStatus}
        isLoading={isLoading}
        onOAuthConnect={handleOAuthConnect}
        onDisconnect={handleDisconnect}
        onStatusRefresh={() => {
          setStatuses((prev) => ({ ...prev, [activePlatform.slug]: undefined as unknown as null }));
          fetchStatus(activePlatform);
        }}
        toast={toast}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform panel                                                     */
/* ------------------------------------------------------------------ */

interface PlatformPanelProps {
  platform: PlatformConfig;
  connectionStatus: ConnectionStatus | null;
  isLoading: boolean;
  onOAuthConnect: (p: PlatformConfig) => void;
  onDisconnect: (p: PlatformConfig) => void;
  onStatusRefresh: () => void;
  toast: (message: string, type: 'success' | 'error') => void;
}

function PlatformPanel({
  platform,
  connectionStatus,
  isLoading,
  onOAuthConnect,
  onDisconnect,
  onStatusRefresh,
  toast,
}: PlatformPanelProps) {
  const isComingSoon = platform.status === 'coming-soon';
  const isConnected = connectionStatus?.connected === true;

  return (
    <div className="space-y-4">
      {/* Platform header card */}
      <Card padding="lg">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{platform.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h4 className="text-xl font-semibold text-text-primary">{platform.name}</h4>
              {isComingSoon && (
                <span className="rounded-full bg-surface-4 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary">{platform.description}</p>
            <p className="mt-2 text-xs text-text-tertiary">{platform.requirements}</p>
          </div>
        </div>

        {/* Connection status */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
                <span className="text-sm text-text-tertiary">Checking connection...</span>
              </>
            ) : isConnected ? (
              <>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-400">
                  Connected
                  {connectionStatus.accountName ? ` as @${connectionStatus.accountName}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-surface-4" />
                <span className="text-sm text-text-tertiary">Not connected</span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isComingSoon && isConnected && (
              <>
                {connectionStatus?.accountUrl && (
                  <a
                    href={connectionStatus.accountUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-3 transition-colors"
                  >
                    View Profile <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  onClick={() => onDisconnect(platform)}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
            {!isComingSoon && !isConnected && !isLoading && platform.authType === 'oauth' && (
              <button
                onClick={() => onOAuthConnect(platform)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: platform.colorHex }}
              >
                Connect {platform.name}
              </button>
            )}
          </div>
        </div>

        {/* Bluesky credential form (inline) */}
        {!isComingSoon && !isConnected && !isLoading && platform.authType === 'credentials' && (
          <BlueskyCredentialForm
            platform={platform}
            onSuccess={(status) => {
              onStatusRefresh();
              toast(`Connected to ${platform.name}!`, 'success');
              // The status refresh will pick up the new state
              void status;
            }}
            onError={(msg) => toast(msg, 'error')}
          />
        )}
      </Card>

      {/* Platform info card */}
      <div
        className="rounded-xl border border-border-subtle p-4 backdrop-blur-sm"
        style={{ backgroundColor: `${platform.colorHex}08` }}
      >
        <h5 className="text-sm font-semibold text-text-primary mb-3">Platform Details</h5>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
              Character Limit
            </p>
            <p className="text-text-primary font-medium">{platform.charLimit.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
              Image Required
            </p>
            <p className="text-text-primary font-medium">{platform.imageRequired ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
              Supported Content
            </p>
            <div className="flex flex-wrap gap-1">
              {platform.supportedTypes.map((type) => (
                <span
                  key={type}
                  className="inline-block rounded-full px-2 py-0.5 text-xs bg-surface-3 text-text-secondary"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Setup instructions */}
      <Card padding="lg">
        <h5 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-accent" />
          Setup Instructions
        </h5>
        <ol className="space-y-2">
          {platform.setupSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-secondary">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: platform.colorHex }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bluesky credential form                                            */
/* ------------------------------------------------------------------ */

interface BlueskyCredentialFormProps {
  platform: PlatformConfig;
  onSuccess: (status: ConnectionStatus) => void;
  onError: (message: string) => void;
}

function BlueskyCredentialForm({ platform, onSuccess, onError }: BlueskyCredentialFormProps) {
  const [handle, setHandle] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !appPassword.trim()) {
      onError('Please enter both your handle and app password.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data } = await api.post(platform.connectUrl!, {
        handle: handle.trim(),
        appPassword: appPassword.trim(),
      });
      onSuccess(data.data ?? data);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message ??
            'Connection failed. Check your credentials and try again.')
          : 'Connection failed. Check your credentials and try again.';
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="bsky-handle">
          Handle
        </label>
        <input
          id="bsky-handle"
          type="text"
          placeholder="yourname.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label
          className="block text-xs font-medium text-text-secondary mb-1"
          htmlFor="bsky-password"
        >
          App Password
        </label>
        <div className="relative">
          <input
            id="bsky-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 pr-10 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-tertiary">
        Create an app password at{' '}
        <a
          href="https://bsky.app/settings/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          bsky.app &rarr; Settings &rarr; Privacy &rarr; App Passwords
        </a>
      </p>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: platform.colorHex }}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting...
          </span>
        ) : (
          `Connect to ${platform.name}`
        )}
      </button>
    </form>
  );
}
