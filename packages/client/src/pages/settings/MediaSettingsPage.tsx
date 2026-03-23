import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SecureInput } from '../../components/ui/SecureInput';
import { api } from '../../lib/api';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
}

export function MediaSettingsPage() {
  const [config, setConfig] = useState<CloudinaryConfig>({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    uploadFolder: 'draftpunk',
  });
  const [maskedSecret, setMaskedSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/admin/settings/cloudinary');
      if (data.data) {
        setConfig({
          cloudName: data.data.cloudName ?? '',
          apiKey: data.data.apiKey ?? '',
          apiSecret: '', // Never send raw secret to client
          uploadFolder: data.data.uploadFolder ?? 'draftpunk',
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
      await api.put('/admin/settings/cloudinary', {
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        apiSecret: config.apiSecret || undefined, // Only send if changed
        uploadFolder: config.uploadFolder,
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
      const { data } = await api.post('/admin/settings/cloudinary/test');
      setTestResult({ success: true, message: data.message || 'Connection successful' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Connection failed';
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900">Media Storage</h3>
      <p className="mt-1 text-sm text-gray-500 mb-6">
        Configure Cloudinary for image uploads, avatar photos, and generated media.
      </p>

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">☁</span>
            <div>
              <h4 className="font-medium text-gray-900">Cloudinary</h4>
              <p className="text-xs text-gray-400">Cloud-based image and video management</p>
            </div>
            {maskedSecret && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Connected
              </span>
            )}
          </div>

          <SecureInput
            label="Cloud Name"
            value={config.cloudName}
            onChange={(val) => setConfig({ ...config, cloudName: val })}
            placeholder="your-cloud-name"
          />

          <SecureInput
            label="API Key"
            value={config.apiKey}
            onChange={(val) => setConfig({ ...config, apiKey: val })}
            placeholder="123456789012345"
          />

          <SecureInput
            label="API Secret"
            value={config.apiSecret}
            onChange={(val) => setConfig({ ...config, apiSecret: val })}
            placeholder={maskedSecret ? 'Leave blank to keep current' : 'Enter API secret'}
            hint={maskedSecret ? `Current: ${maskedSecret}` : undefined}
          />

          <Input
            label="Upload Folder"
            value={config.uploadFolder}
            onChange={(e) => setConfig({ ...config, uploadFolder: e.target.value })}
            placeholder="draftpunk"
          />
          <p className="text-xs text-gray-400 -mt-2">
            All uploads will be stored under this folder in Cloudinary (e.g., draftpunk/avatars/).
          </p>

          {testResult && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              testResult.success
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing || !config.cloudName}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
