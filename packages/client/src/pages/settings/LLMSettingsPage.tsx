import { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { MaskedField } from '../../components/ui/MaskedField';
import { api } from '../../lib/api';

interface ProviderModel {
  id: string;
  name: string;
  description?: string;
}

interface AIProvider {
  id: string;
  name: string;
  providerType: string;
  icon: string;
  models: ProviderModel[];
  isConfigured: boolean;
  maskedKey: string;
  isEnabled: boolean;
}

export function LLMSettingsPage() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rawKeys, setRawKeys] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/admin/ai-providers');
      setProviders(data.data);
    } catch {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fetchRawKey = async (providerId: string) => {
    if (rawKeys[providerId] !== undefined) return rawKeys[providerId];
    try {
      const { data } = await api.get(`/admin/ai-providers/${providerId}/key`);
      const key = data.data.apiKey || '';
      setRawKeys((prev) => ({ ...prev, [providerId]: key }));
      return key;
    } catch {
      return '';
    }
  };

  const handleSaveKey = async (providerId: string, apiKey: string) => {
    await api.put(`/admin/ai-providers/${providerId}/key`, { apiKey });
    setRawKeys((prev) => ({ ...prev, [providerId]: apiKey }));
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">AI Models</h3>
        <p className="text-sm text-gray-500">
          Configure API keys for AI providers. Only providers with keys will appear in Designer model dropdowns.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              rawKey={rawKeys[provider.id]}
              onFetchKey={() => fetchRawKey(provider.id)}
              onSaveKey={(key) => handleSaveKey(provider.id, key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProviderCardProps {
  provider: AIProvider;
  rawKey: string | undefined;
  onFetchKey: () => Promise<string>;
  onSaveKey: (key: string) => Promise<void>;
}

function ProviderCard({ provider, rawKey, onFetchKey: _onFetchKey, onSaveKey }: ProviderCardProps) {
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  return (
    <Card padding="lg">
      <div className="flex items-start gap-4">
        <span className="text-3xl">{provider.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-gray-900">{provider.name}</h4>
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                provider.isConfigured ? 'bg-green-500' : 'bg-gray-300'
              }`}
              title={provider.isConfigured ? 'Configured' : 'No API key'}
            />
          </div>

          <MaskedField
            label="API Key"
            value={fetchedKey ?? rawKey ?? ''}
            maskedValue={provider.maskedKey || 'Not configured'}
            editable
            onSave={async (key) => {
              await onSaveKey(key);
              setFetchedKey(key);
            }}
          />

          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">Available Models</p>
            <div className="flex flex-wrap gap-1">
              {provider.models.map((model) => (
                <span
                  key={model.id}
                  title={model.description}
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                    provider.isConfigured
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {model.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
