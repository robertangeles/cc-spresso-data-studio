import { useState, useEffect, useCallback } from 'react';
import { Save, DollarSign } from 'lucide-react';
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
        <h3 className="text-lg font-semibold text-text-primary">AI Models</h3>
        <p className="text-sm text-text-secondary">
          Configure API keys for AI providers. Only providers with keys will appear in Designer model dropdowns.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
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

      <ModelPricingSection />
    </div>
  );
}

interface ProviderCardProps {
  provider: AIProvider;
  rawKey: string | undefined;
  onFetchKey: () => Promise<string>;
  onSaveKey: (key: string) => Promise<void>;
}

// --- Model Pricing Section ---

interface DimModel {
  id: string;
  modelId: string;
  provider: string;
  displayName: string;
  inputCostPerM: number;
  outputCostPerM: number;
  isActive: boolean;
}

function ModelPricingSection() {
  const [models, setModels] = useState<DimModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ inputCostPerM: string; outputCostPerM: string }>({ inputCostPerM: '', outputCostPerM: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/usage/models').then(({ data }) => {
      setModels(data.data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const startEdit = (model: DimModel) => {
    setEditingId(model.id);
    setEditValues({
      inputCostPerM: model.inputCostPerM.toString(),
      outputCostPerM: model.outputCostPerM.toString(),
    });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/usage/models/${id}`, {
        inputCostPerM: parseFloat(editValues.inputCostPerM),
        outputCostPerM: parseFloat(editValues.outputCostPerM),
      });
      setModels((prev) => prev.map((m) => (m.id === id ? data.data : m)));
      setEditingId(null);
    } catch {
      // keep editing state
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;
  if (models.length === 0) return null;

  // Group by provider
  const grouped = models.reduce<Record<string, DimModel[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <div className="border-t border-border-default pt-6">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold text-text-primary">Model Pricing</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Cost per 1M tokens for usage tracking. Click a row to edit.
        </p>
      </div>

      <div className="rounded-lg border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 border-b border-border-default">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-text-secondary">Model</th>
              <th className="px-4 py-2 text-right font-medium text-text-secondary">Input $/1M</th>
              <th className="px-4 py-2 text-right font-medium text-text-secondary">Output $/1M</th>
              <th className="px-4 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([provider, providerModels]) => (
              <>
                <tr key={`header-${provider}`} className="bg-surface-3/50">
                  <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {provider}
                  </td>
                </tr>
                {providerModels.map((model) => (
                  <tr
                    key={model.id}
                    className={`border-b border-border-subtle cursor-pointer bg-surface-2 hover:bg-surface-3 ${editingId === model.id ? 'bg-accent-dim' : ''}`}
                    onClick={() => editingId !== model.id && startEdit(model)}
                  >
                    <td className="px-4 py-2 text-text-primary">{model.displayName}</td>
                    <td className="px-4 py-2 text-right">
                      {editingId === model.id ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded border border-border-default bg-surface-3 px-2 py-0.5 text-right text-sm text-text-primary"
                          value={editValues.inputCostPerM}
                          onChange={(e) => setEditValues((v) => ({ ...v, inputCostPerM: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-text-secondary">${model.inputCostPerM}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingId === model.id ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded border border-border-default bg-surface-3 px-2 py-0.5 text-right text-sm text-text-primary"
                          value={editValues.outputCostPerM}
                          onChange={(e) => setEditValues((v) => ({ ...v, outputCostPerM: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-text-secondary">${model.outputCostPerM}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editingId === model.id && (
                        <button
                          disabled={saving}
                          onClick={(e) => { e.stopPropagation(); saveEdit(model.id); }}
                          className="rounded p-1 text-accent hover:bg-accent-dim disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Provider Card ---

function ProviderCard({ provider, rawKey, onFetchKey: _onFetchKey, onSaveKey }: ProviderCardProps) {
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  return (
    <Card padding="lg">
      <div className="flex items-start gap-4">
        <span className="text-3xl">{provider.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-text-primary">{provider.name}</h4>
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                provider.isConfigured ? 'bg-green-500' : 'bg-surface-4'
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
            <p className="text-xs text-text-secondary mb-1">Available Models</p>
            <div className="flex flex-wrap gap-1">
              {provider.models.map((model) => (
                <span
                  key={model.id}
                  title={model.description}
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                    provider.isConfigured
                      ? 'bg-accent-dim text-accent'
                      : 'bg-surface-3 text-text-tertiary'
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
