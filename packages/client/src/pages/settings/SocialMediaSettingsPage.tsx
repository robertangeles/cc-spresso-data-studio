import { useState, useEffect } from 'react';
import { Share2, Check, Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Platform admin configuration                                       */
/* ------------------------------------------------------------------ */

interface PlatformInfo {
  slug: string;
  name: string;
  icon: string;
  colorHex: string;
  description: string;
  authType: 'oauth' | 'credentials';
  credentialKeys: string[]; // settings keys needed (e.g., META_APP_ID, META_APP_SECRET)
  credentialLabels: string[];
  setupSteps: string[];
  status: 'ready' | 'coming-soon';
}

const PLATFORMS: PlatformInfo[] = [
  {
    slug: 'instagram',
    name: 'Instagram',
    icon: '📸',
    colorHex: '#ec4899',
    description: 'Requires Meta Developer App with Instagram Graph API',
    authType: 'oauth',
    credentialKeys: ['META_APP_ID', 'META_APP_SECRET'],
    credentialLabels: ['Meta App ID', 'Meta App Secret'],
    setupSteps: [
      'Go to developers.facebook.com and create a Business app',
      'Add "Instagram Graph API" and "Facebook Login" products',
      'Go to App Settings → Basic to get App ID and App Secret',
      'Add OAuth redirect URI: /api/oauth/instagram/callback',
      'Enter the App ID and App Secret below',
    ],
    status: 'ready',
  },
  {
    slug: 'facebook',
    name: 'Facebook',
    icon: '📘',
    colorHex: '#2563eb',
    description: 'Uses the same Meta Developer App as Instagram',
    authType: 'oauth',
    credentialKeys: ['META_APP_ID', 'META_APP_SECRET'],
    credentialLabels: ['Meta App ID', 'Meta App Secret'],
    setupSteps: ['Same setup as Instagram — shared Meta Developer App'],
    status: 'ready',
  },
  {
    slug: 'threads',
    name: 'Threads',
    icon: '🧵',
    colorHex: '#d1d5db',
    description: 'Requires a separate Meta App with Threads API use case',
    authType: 'oauth',
    credentialKeys: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
    credentialLabels: ['Threads App ID', 'Threads App Secret'],
    setupSteps: [
      'Create a separate Meta App at developers.facebook.com',
      'Select "Access the Threads API" as the use case',
      'Copy App ID and App Secret from App Settings → Basic',
    ],
    status: 'ready',
  },
  {
    slug: 'bluesky',
    name: 'Bluesky',
    icon: '🦋',
    colorHex: '#38bdf8',
    description: 'No admin setup needed — users connect via app passwords in their Profile',
    authType: 'credentials',
    credentialKeys: [],
    credentialLabels: [],
    setupSteps: [
      'No admin configuration required',
      'Users create app passwords at bsky.app → Settings → Privacy → App Passwords',
      'Users connect in Profile → Social Accounts',
    ],
    status: 'ready',
  },
  {
    slug: 'twitter',
    name: 'Twitter / X',
    icon: '🐦',
    colorHex: '#60a5fa',
    description: 'Requires Twitter Developer account ($100/month basic tier)',
    authType: 'oauth',
    credentialKeys: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
    credentialLabels: ['Client ID', 'Client Secret'],
    setupSteps: [
      'Go to developer.x.com and create a project + app',
      'Subscribe to Basic tier ($100/mo) for write access',
      'Enable OAuth 2.0 with PKCE under User Authentication Settings',
      'Set callback URL to: {your-domain}/api/oauth/twitter/callback',
      'Copy the Client ID and Client Secret below',
      'Users connect in Profile → Social Accounts',
    ],
    status: 'ready',
  },
  {
    slug: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    colorHex: '#3b82f6',
    description: 'Two LinkedIn apps: one for Personal Profile, one for Company Pages',
    authType: 'oauth',
    credentialKeys: [
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'LINKEDIN_ORG_CLIENT_ID',
      'LINKEDIN_ORG_CLIENT_SECRET',
    ],
    credentialLabels: [
      'Personal — Client ID',
      'Personal — Client Secret',
      'Company Page — Client ID',
      'Company Page — Client Secret',
    ],
    setupSteps: [
      'App 1 (Personal): Create app with "Share on LinkedIn" + "Sign In with LinkedIn" products',
      'App 2 (Company Page): Create separate app with "Community Management API" product only',
      'Enter both sets of credentials below',
    ],
    status: 'ready',
  },
  {
    slug: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    colorHex: '#22d3ee',
    description: 'Requires TikTok for Developers app',
    authType: 'oauth',
    credentialKeys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    credentialLabels: ['Client Key', 'Client Secret'],
    setupSteps: [
      'Go to developers.tiktok.com and create an app',
      'Enter Client Key and Client Secret below',
    ],
    status: 'coming-soon',
  },
  {
    slug: 'pinterest',
    name: 'Pinterest',
    icon: '📌',
    colorHex: '#ef4444',
    description: 'Requires Pinterest Developer app',
    authType: 'oauth',
    credentialKeys: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
    credentialLabels: ['App ID', 'App Secret'],
    setupSteps: [
      'Go to developers.pinterest.com and create an app',
      'Enter App ID and App Secret below',
    ],
    status: 'ready',
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    colorHex: '#dc2626',
    description: 'Requires Google Cloud project with YouTube Data API',
    authType: 'oauth',
    credentialKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    credentialLabels: ['Client ID', 'Client Secret'],
    setupSteps: [
      'Go to console.cloud.google.com and create a project',
      'Enable YouTube Data API v3',
      'Create OAuth 2.0 credentials',
      'Enter Client ID and Client Secret below',
    ],
    status: 'coming-soon',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SocialMediaSettingsPage() {
  const [activeTab, setActiveTab] = useState(PLATFORMS[0].slug);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [savedCredentials, setSavedCredentials] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const activePlatform = PLATFORMS.find((p) => p.slug === activeTab) ?? PLATFORMS[0];

  // Fetch existing credentials on mount
  useEffect(() => {
    async function fetchCredentials() {
      setLoading(true);
      try {
        // Check which credential keys have values in settings
        for (const platform of PLATFORMS) {
          for (const key of platform.credentialKeys) {
            try {
              const { data } = await api.get(`/admin/settings/${key}`);
              if (data.data?.value) {
                setCredentials((prev) => ({ ...prev, [key]: '••••••••' }));
                setSavedCredentials((prev) => ({ ...prev, [key]: true }));
              }
            } catch {
              // Key doesn't exist yet — that's fine
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }
    fetchCredentials();
  }, []);

  const handleSaveCredentials = async () => {
    setSaving(true);
    try {
      for (const key of activePlatform.credentialKeys) {
        const value = credentials[key];
        if (value && value !== '••••••••') {
          await api.put('/admin/settings', { key, value, isSecret: true });
        }
      }
      // Mark as saved
      for (const key of activePlatform.credentialKeys) {
        if (credentials[key]) {
          setSavedCredentials((prev) => ({ ...prev, [key]: true }));
        }
      }
      toast('Credentials saved successfully', 'success');
    } catch {
      toast('Failed to save credentials', 'error');
    } finally {
      setSaving(false);
    }
  };

  const allCredentialsSaved =
    activePlatform.credentialKeys.length === 0 ||
    activePlatform.credentialKeys.every((key) => savedCredentials[key]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Share2 className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold text-text-primary">Social Media</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Configure platform API credentials so users can connect their social accounts. Users
          connect their own accounts in Profile → Social Accounts.
        </p>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {PLATFORMS.map((p) => (
          <button
            key={p.slug}
            onClick={() => setActiveTab(p.slug)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
              activeTab === p.slug
                ? 'bg-surface-3 text-text-primary border border-border-default'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }`}
            style={activeTab === p.slug ? { borderColor: `${p.colorHex}40` } : undefined}
          >
            <span>{p.icon}</span>
            <span>{p.name}</span>
            {p.status === 'coming-soon' && (
              <span className="text-[9px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded-full">
                SOON
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active platform panel */}
      <div className="bg-surface-2 rounded-xl border border-border-subtle p-6">
        {/* Platform header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{activePlatform.icon}</span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{activePlatform.name}</h2>
            <p className="text-sm text-text-secondary">{activePlatform.description}</p>
          </div>
          {allCredentialsSaved && activePlatform.credentialKeys.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-500/10 text-green-400 px-3 py-1 text-xs font-medium">
              <Check className="h-3 w-3" /> Configured
            </span>
          )}
          {activePlatform.credentialKeys.length === 0 && activePlatform.status === 'ready' && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-500/10 text-green-400 px-3 py-1 text-xs font-medium">
              <Check className="h-3 w-3" /> No admin setup needed
            </span>
          )}
        </div>

        {/* Setup steps */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-primary mb-2">Setup Instructions</h3>
          <ol className="space-y-1.5">
            {activePlatform.setupSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-text-tertiary mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Credential inputs (only for platforms that need them) */}
        {activePlatform.credentialKeys.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-primary">API Credentials</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <>
                {activePlatform.credentialKeys.map((key, i) => {
                  const isSecret = true; // all credential fields are sensitive
                  const isSavedMask = credentials[key] === '••••••••';
                  return (
                    <div key={key}>
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">
                        {activePlatform.credentialLabels[i]}
                        {savedCredentials[key] && (
                          <span className="ml-2 text-green-400 text-[10px]">✓ saved</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type={isSecret && !visibleKeys[key] ? 'password' : 'text'}
                          value={credentials[key] ?? ''}
                          onChange={(e) =>
                            setCredentials((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder={`Enter ${activePlatform.credentialLabels[i]}...`}
                          className="w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 pr-10 text-text-primary text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors placeholder:text-text-tertiary font-mono"
                        />
                        {isSecret && !isSavedMask && (
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleKeys((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                          >
                            {visibleKeys[key] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={handleSaveCredentials}
                  disabled={saving || activePlatform.status === 'coming-soon'}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent text-text-inverse px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : 'Save Credentials'}
                </button>
              </>
            )}

            {activePlatform.status === 'coming-soon' && (
              <p className="text-xs text-text-tertiary mt-2">
                Publishing integration coming soon. Save your credentials now so they are ready when
                we launch.
              </p>
            )}
          </div>
        )}

        {/* No credentials needed message */}
        {activePlatform.credentialKeys.length === 0 && (
          <div className="bg-surface-3/50 rounded-lg p-4 text-sm text-text-secondary">
            No admin configuration required for {activePlatform.name}. Users can connect their
            accounts directly in{' '}
            <span className="text-accent font-medium">Profile → Social Accounts</span>.
          </div>
        )}
      </div>
    </div>
  );
}
