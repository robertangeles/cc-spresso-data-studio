import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SecureInput } from '../../components/ui/SecureInput';
import { api } from '../../lib/api';

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUriDev: string;
  redirectUriProd: string;
}

interface ResendConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export function AuthSettingsPage() {
  const [config, setConfig] = useState<GoogleOAuthConfig>({
    clientId: '',
    clientSecret: '',
    redirectUriDev: 'http://localhost:5173/auth/google/callback',
    redirectUriProd: 'https://spresso.xyz/auth/google/callback',
  });
  const [maskedSecret, setMaskedSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Resend email config
  const [resendConfig, setResendConfig] = useState<ResendConfig>({
    apiKey: '',
    fromAddress: 'noreply@spresso.app',
    fromName: 'Spresso',
  });
  const [resendMaskedKey, setResendMaskedKey] = useState('');
  const [resendSaving, setResendSaving] = useState(false);
  const [resendSaved, setResendSaved] = useState(false);

  // Turnstile config
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileConfig>({
    siteKey: '',
    secretKey: '',
  });
  const [turnstileMaskedSecret, setTurnstileMaskedSecret] = useState('');
  const [turnstileSaving, setTurnstileSaving] = useState(false);
  const [turnstileSaved, setTurnstileSaved] = useState(false);

  useEffect(() => {
    loadConfig();
    loadResendConfig();
    loadTurnstileConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/admin/settings/google-oauth');
      if (data.data) {
        setConfig({
          clientId: data.data.clientId ?? '',
          clientSecret: '',
          redirectUriDev: data.data.redirectUriDev ?? 'http://localhost:5173/auth/google/callback',
          redirectUriProd: data.data.redirectUriProd ?? 'https://spresso.xyz/auth/google/callback',
        });
        setMaskedSecret(data.data.maskedSecret ?? '');
      }
    } catch {
      // First time — no config yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/admin/settings/google-oauth', {
        clientId: config.clientId,
        clientSecret: config.clientSecret || undefined,
        redirectUriDev: config.redirectUriDev,
        redirectUriProd: config.redirectUriProd,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadConfig();
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/admin/settings/google-oauth/test');
      setTestResult({ success: true, message: data.message || 'Connection successful' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Connection failed';
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const loadResendConfig = async () => {
    try {
      const { data } = await api.get('/admin/settings/resend');
      if (data.data) {
        setResendConfig({
          apiKey: '',
          fromAddress: data.data.fromAddress ?? 'noreply@spresso.app',
          fromName: data.data.fromName ?? 'Spresso',
        });
        setResendMaskedKey(data.data.maskedKey ?? '');
      }
    } catch {
      // First time — no config yet
    }
  };

  const handleResendSave = async () => {
    setResendSaving(true);
    setResendSaved(false);
    try {
      await api.put('/admin/settings/resend', {
        apiKey: resendConfig.apiKey || undefined,
        fromAddress: resendConfig.fromAddress,
        fromName: resendConfig.fromName,
      });
      setResendSaved(true);
      setTimeout(() => setResendSaved(false), 3000);
      await loadResendConfig();
    } catch {
      // Error handling
    } finally {
      setResendSaving(false);
    }
  };

  const loadTurnstileConfig = async () => {
    try {
      const { data } = await api.get('/admin/settings/turnstile');
      if (data.data) {
        setTurnstileConfig({
          siteKey: data.data.siteKey ?? '',
          secretKey: '',
        });
        setTurnstileMaskedSecret(data.data.maskedSecret ?? '');
      }
    } catch {
      // First time — no config yet
    }
  };

  const handleTurnstileSave = async () => {
    setTurnstileSaving(true);
    setTurnstileSaved(false);
    try {
      await api.put('/admin/settings/turnstile', {
        siteKey: turnstileConfig.siteKey,
        secretKey: turnstileConfig.secretKey || undefined,
      });
      setTurnstileSaved(true);
      setTimeout(() => setTurnstileSaved(false), 3000);
      await loadTurnstileConfig();
    } catch {
      // Error handling
    } finally {
      setTurnstileSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary">Authentication</h3>
      <p className="mt-1 text-sm text-text-secondary mb-6">
        Configure third-party login providers. Users can sign in with Google alongside
        email/password.
      </p>

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <svg className="h-6 w-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <div>
              <h4 className="font-medium text-text-primary">Google OAuth 2.0</h4>
              <p className="text-xs text-text-tertiary">
                Allow users to sign in with their Google account
              </p>
            </div>
            {maskedSecret && (
              <span className="ml-auto rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                Connected
              </span>
            )}
          </div>

          <SecureInput
            label="Client ID"
            value={config.clientId}
            onChange={(val) => setConfig({ ...config, clientId: val })}
            placeholder="123456789.apps.googleusercontent.com"
          />

          <SecureInput
            label="Client Secret"
            value={config.clientSecret}
            onChange={(val) => setConfig({ ...config, clientSecret: val })}
            placeholder={maskedSecret ? 'Leave blank to keep current' : 'Enter client secret'}
            hint={maskedSecret ? `Current: ${maskedSecret}` : undefined}
          />

          <Input
            label="Redirect URI (Development)"
            value={config.redirectUriDev || ''}
            onChange={(e) => setConfig({ ...config, redirectUriDev: e.target.value })}
            placeholder="http://localhost:5173/auth/google/callback"
          />

          <Input
            label="Redirect URI (Production)"
            value={config.redirectUriProd || ''}
            onChange={(e) => setConfig({ ...config, redirectUriProd: e.target.value })}
            placeholder="https://spresso.xyz/auth/google/callback"
          />
          <p className="text-xs text-text-tertiary -mt-2">
            Both URIs must be added as authorized redirect URIs in your Google Cloud Console. The
            system automatically uses the correct one based on the environment.
          </p>

          {testResult && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                testResult.success
                  ? 'border-green-500/20 bg-green-500/10 text-green-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-400'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing || !config.clientId}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>

      <div className="mt-6 rounded-lg border border-border-subtle bg-surface-2/30 p-4">
        <h4 className="text-sm font-medium text-text-primary mb-2">Setup Guide</h4>
        <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
          <li>Go to Google Cloud Console and create or select a project</li>
          <li>Navigate to APIs & Services &rarr; OAuth consent screen &rarr; choose External</li>
          <li>
            Add scopes: <code className="text-accent/80">email</code>,{' '}
            <code className="text-accent/80">profile</code>,{' '}
            <code className="text-accent/80">openid</code>
          </li>
          <li>Go to Credentials &rarr; Create OAuth 2.0 Client ID (Web application)</li>
          <li>Add your redirect URI(s) under Authorized redirect URIs</li>
          <li>Copy Client ID and Client Secret into the fields above</li>
        </ol>
      </div>

      {/* Resend Email Integration */}
      <h3 className="text-lg font-semibold text-text-primary mt-10">Email Verification</h3>
      <p className="mt-1 text-sm text-text-secondary mb-6">
        Configure Resend for transactional emails (verification, password reset).
      </p>

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-violet-500/20 text-violet-400 text-xs font-bold">
              R
            </div>
            <div>
              <h4 className="font-medium text-text-primary">Resend</h4>
              <p className="text-xs text-text-tertiary">
                Transactional email for verification and notifications
              </p>
            </div>
            {resendMaskedKey && (
              <span className="ml-auto rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                Connected
              </span>
            )}
          </div>

          <SecureInput
            label="API Key"
            value={resendConfig.apiKey}
            onChange={(val) => setResendConfig({ ...resendConfig, apiKey: val })}
            placeholder={resendMaskedKey ? 'Leave blank to keep current' : 're_xxxxxxxxxxxx'}
            hint={resendMaskedKey ? `Current: ${resendMaskedKey}` : undefined}
          />

          <Input
            label="From Address"
            value={resendConfig.fromAddress}
            onChange={(e) => setResendConfig({ ...resendConfig, fromAddress: e.target.value })}
            placeholder="noreply@spresso.app"
          />

          <Input
            label="From Name"
            value={resendConfig.fromName}
            onChange={(e) => setResendConfig({ ...resendConfig, fromName: e.target.value })}
            placeholder="Spresso"
          />

          <div className="flex items-center gap-3">
            <Button onClick={handleResendSave} disabled={resendSaving}>
              {resendSaving ? 'Saving...' : 'Save'}
            </Button>
            {resendSaved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>

      {/* Turnstile Bot Protection */}
      <h3 className="text-lg font-semibold text-text-primary mt-10">Bot Protection</h3>
      <p className="mt-1 text-sm text-text-secondary mb-6">
        Cloudflare Turnstile prevents bots from creating accounts. Free and privacy-respecting.
      </p>

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-orange-500/20 text-orange-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h4 className="font-medium text-text-primary">Cloudflare Turnstile</h4>
              <p className="text-xs text-text-tertiary">
                Invisible CAPTCHA that stops bots without annoying users
              </p>
            </div>
            {turnstileMaskedSecret && (
              <span className="ml-auto rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                Active
              </span>
            )}
          </div>

          <Input
            label="Site Key"
            value={turnstileConfig.siteKey}
            onChange={(e) => setTurnstileConfig({ ...turnstileConfig, siteKey: e.target.value })}
            placeholder="0x4AAAAAAA..."
          />
          <p className="text-xs text-text-tertiary -mt-2">
            This key is public and embedded in the registration form.
          </p>

          <SecureInput
            label="Secret Key"
            value={turnstileConfig.secretKey}
            onChange={(val) => setTurnstileConfig({ ...turnstileConfig, secretKey: val })}
            placeholder={turnstileMaskedSecret ? 'Leave blank to keep current' : '0x4AAAAAAA...'}
            hint={turnstileMaskedSecret ? `Current: ${turnstileMaskedSecret}` : undefined}
          />

          <div className="flex items-center gap-3">
            <Button onClick={handleTurnstileSave} disabled={turnstileSaving}>
              {turnstileSaving ? 'Saving...' : 'Save'}
            </Button>
            {turnstileSaved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>

      <div className="mt-6 rounded-lg border border-border-subtle bg-surface-2/30 p-4">
        <h4 className="text-sm font-medium text-text-primary mb-2">Turnstile Setup</h4>
        <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
          <li>Go to the Cloudflare dashboard &rarr; Turnstile</li>
          <li>Click &ldquo;Add site&rdquo; and enter your domain</li>
          <li>Choose widget mode (Managed is recommended)</li>
          <li>Copy the Site Key and Secret Key into the fields above</li>
        </ol>
      </div>
    </div>
  );
}
