import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

interface SiteSettings {
  sessionDuration: string;
  aiTimeoutSeconds: number;
}

const TIMEOUT_OPTIONS = [
  { value: 60, label: '60 seconds' },
  { value: 120, label: '2 minutes' },
  { value: 180, label: '3 minutes (default)' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
];

const SESSION_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours (default)' },
  { value: '8h', label: '8 hours' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
];

export function SiteSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>({
    sessionDuration: '4h',
    aiTimeoutSeconds: 180,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/admin/settings/site');
      if (data.data) {
        setSettings(data.data);
      }
    } catch {
      // First time — use defaults
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/admin/settings/site', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
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
      <h3 className="text-lg font-semibold text-text-primary">Site Settings</h3>
      <p className="mt-1 text-sm text-text-secondary mb-6">
        System-wide configuration for Spresso Data Studio.
      </p>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Security</h4>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Session Duration
            </label>
            <select
              value={settings.sessionDuration}
              onChange={(e) => setSettings({ ...settings, sessionDuration: e.target.value })}
              className="w-full max-w-xs rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {SESSION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-tertiary">
              How long before users need to re-authenticate. Longer sessions are more convenient but
              less secure. Changes take effect on next login.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">AI Execution</h4>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              AI Provider Timeout
            </label>
            <select
              value={settings.aiTimeoutSeconds}
              onChange={(e) =>
                setSettings({ ...settings, aiTimeoutSeconds: parseInt(e.target.value) })
              }
              className="w-full max-w-xs rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {TIMEOUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-tertiary">
              Maximum time to wait for an AI model response per step. Increase for slower models
              (Qwen, Opus) or long-form content. If a step times out, it retries once before
              failing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
