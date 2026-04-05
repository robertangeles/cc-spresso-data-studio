import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Loader2,
  FlaskConical,
  Rocket,
  Eye,
  EyeOff,
  Tag,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type StripeMode = 'test' | 'live';

interface StripeKeySet {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  prices: Record<string, string>;
}

interface StripeSettings {
  configured: boolean;
  mode: StripeMode;
  test: StripeKeySet;
  live: StripeKeySet;
}

interface PlanInfo {
  id: string;
  name: string;
  displayName: string;
  priceCents: number;
}

const emptyKeys: StripeKeySet = {
  secretKey: '',
  publishableKey: '',
  webhookSecret: '',
  prices: {},
};

export function StripeSettingsPage() {
  const [settings, setSettings] = useState<StripeSettings>({
    configured: false,
    mode: 'test',
    test: { ...emptyKeys },
    live: { ...emptyKeys },
  });
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean } | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const [configRes, plansRes] = await Promise.all([
        api.get('/billing/admin/stripe'),
        api.get('/billing/plans'),
      ]);

      if (configRes.data.data) {
        setSettings({
          configured: configRes.data.data.configured ?? false,
          mode: configRes.data.data.mode ?? 'test',
          test: { ...emptyKeys, ...configRes.data.data.test },
          live: { ...emptyKeys, ...configRes.data.data.live },
        });
      }

      if (plansRes.data.data?.plans) {
        setPlans(
          plansRes.data.data.plans
            .filter((p: PlanInfo) => p.priceCents > 0)
            .map((p: PlanInfo) => ({
              id: p.id,
              name: p.name,
              displayName: p.displayName,
              priceCents: p.priceCents,
            })),
        );
      }
    } catch {
      // keep defaults
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const activeKeys = settings[settings.mode];

  const updateKey = (field: keyof Omit<StripeKeySet, 'prices'>, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [prev.mode]: { ...prev[prev.mode], [field]: value },
    }));
  };

  const updatePrice = (planName: string, priceId: string) => {
    setSettings((prev) => ({
      ...prev,
      [prev.mode]: {
        ...prev[prev.mode],
        prices: { ...prev[prev.mode].prices, [planName]: priceId },
      },
    }));
  };

  const handleModeSwitch = (mode: StripeMode) => {
    setSettings((prev) => ({ ...prev, mode }));
    setTestResult(null);
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaved(false);
      setTestResult(null);
      await api.put('/billing/admin/stripe', {
        mode: settings.mode,
        [settings.mode]: settings[settings.mode],
      });
      setSaved(true);
      await loadConfig();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // error handled by api interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const { data } = await api.post('/billing/admin/stripe/test');
      setTestResult(data.data);
    } catch {
      setTestResult({ connected: false });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Stripe Configuration</h3>
        <p className="text-sm text-text-secondary">
          Manage your Stripe API keys and product Price IDs. Configure both test and live
          environments, then switch modes as needed.
        </p>
      </div>

      {/* Mode Toggle */}
      <Card padding="lg">
        <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
          <h4 className="font-medium text-text-primary mb-3">Environment</h4>
          <div className="flex gap-3">
            <button
              onClick={() => handleModeSwitch('test')}
              className={`flex-1 flex items-center justify-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                settings.mode === 'test'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(255,214,10,0.1)]'
                  : 'border-border-default bg-surface-3 text-text-secondary hover:border-border-hover hover:text-text-primary'
              }`}
            >
              <FlaskConical className="h-4 w-4" />
              Sandbox / Test
            </button>
            <button
              onClick={() => handleModeSwitch('live')}
              className={`flex-1 flex items-center justify-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                settings.mode === 'live'
                  ? 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_12px_rgba(34,197,94,0.1)]'
                  : 'border-border-default bg-surface-3 text-text-secondary hover:border-border-hover hover:text-text-primary'
              }`}
            >
              <Rocket className="h-4 w-4" />
              Live / Production
            </button>
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            {settings.mode === 'test'
              ? 'Using sandbox keys — no real charges will be made. Test cards: 4242 4242 4242 4242'
              : 'Using live keys — real payments will be processed. Handle with care.'}
          </p>
        </div>
      </Card>

      {/* Status Card */}
      <Card padding="lg">
        <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
                <CreditCard className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h4 className="font-medium text-text-primary">Connection Status</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      settings.configured
                        ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                    }`}
                  />
                  <span className="text-sm text-text-secondary">
                    {settings.configured ? `Connected (${settings.mode})` : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleTestConnection} disabled={testing}>
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>

          {testResult && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                testResult.connected
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {testResult.connected ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Connection successful. Stripe API is reachable ({settings.mode} mode).
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Connection failed. Please verify your {settings.mode} API keys.
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* API Keys Card */}
      <Card padding="lg">
        <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">
              {settings.mode === 'test' ? 'Test' : 'Live'} API Keys
            </h4>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                settings.mode === 'test'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}
            >
              {settings.mode === 'test' ? 'Sandbox' : 'Production'}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-6">
            Get your API keys from the{' '}
            <a
              href={`https://dashboard.stripe.com/${settings.mode === 'test' ? 'test/' : ''}apikeys`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Stripe Dashboard
            </a>
            .
          </p>

          <div className="space-y-5">
            {/* Secret Key */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Secret Key
              </label>
              <div className="relative">
                <input
                  type={visible.secretKey ? 'text' : 'password'}
                  value={activeKeys.secretKey}
                  onChange={(e) => updateKey('secretKey', e.target.value)}
                  placeholder={settings.mode === 'test' ? 'sk_test_...' : 'sk_live_...'}
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => ({ ...v, secretKey: !v.secretKey }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {visible.secretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Publishable Key */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Publishable Key
              </label>
              <div className="relative">
                <input
                  type={visible.publishableKey ? 'text' : 'password'}
                  value={activeKeys.publishableKey}
                  onChange={(e) => updateKey('publishableKey', e.target.value)}
                  placeholder={settings.mode === 'test' ? 'pk_test_...' : 'pk_live_...'}
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => ({ ...v, publishableKey: !v.publishableKey }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {visible.publishableKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Webhook Secret
              </label>
              <div className="relative">
                <input
                  type={visible.webhookSecret ? 'text' : 'password'}
                  value={activeKeys.webhookSecret}
                  onChange={(e) => updateKey('webhookSecret', e.target.value)}
                  placeholder="whsec_..."
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => ({ ...v, webhookSecret: !v.webhookSecret }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {visible.webhookSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Price IDs Card */}
      {plans.length > 0 && (
        <Card padding="lg">
          <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
                <Tag className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h4 className="font-medium text-text-primary">
                  {settings.mode === 'test' ? 'Test' : 'Live'} Price IDs
                </h4>
                <p className="text-sm text-text-secondary">
                  Map each plan to its Stripe Price ID from{' '}
                  <a
                    href="https://dashboard.stripe.com/products"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Product Catalog
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {plans.map((plan) => (
                <div key={plan.name}>
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-text-secondary">
                    {plan.displayName}
                    <span className="text-xs text-text-tertiary">
                      (${(plan.priceCents / 100).toFixed(0)}/mo)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={activeKeys.prices[plan.name] || ''}
                    onChange={(e) => updatePrice(plan.name, e.target.value)}
                    placeholder="price_..."
                    className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Save Button */}
      <Card padding="lg">
        <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                `Save ${settings.mode === 'test' ? 'Test' : 'Live'} Configuration`
              )}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" />
                Saved successfully
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
