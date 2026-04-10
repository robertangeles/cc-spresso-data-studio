import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ChevronDown, Eye, Image, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { MaskedField } from '../../components/ui/MaskedField';
import { api } from '../../lib/api';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import type { OpenRouterCatalogModel } from '@cc/shared';

// ------------------------------------------------------------------
// Provider config (single OpenRouter provider)
// ------------------------------------------------------------------

interface AIProvider {
  id: string;
  name: string;
  providerType: string;
  icon: string;
  isConfigured: boolean;
  maskedKey: string;
  isEnabled: boolean;
}

export function LLMSettingsPage() {
  const [provider, setProvider] = useState<AIProvider | null>(null);
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);
  const [rawKey, setRawKey] = useState<string | undefined>(undefined);

  const catalog = useModelCatalog();

  const refreshProvider = useCallback(async () => {
    setIsLoadingProvider(true);
    try {
      const { data } = await api.get('/admin/ai-providers');
      const providers = data.data as AIProvider[];
      setProvider(providers[0] ?? null);
    } catch {
      setProvider(null);
    } finally {
      setIsLoadingProvider(false);
    }
  }, []);

  useEffect(() => {
    refreshProvider();
  }, [refreshProvider]);

  const handleSaveKey = async (providerId: string, apiKey: string) => {
    await api.put(`/admin/ai-providers/${providerId}/key`, { apiKey });
    setRawKey(apiKey);
    await refreshProvider();
    if (apiKey) {
      await catalog.syncCatalog();
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: OpenRouter Connection */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary">AI Models</h3>
        <p className="text-sm text-text-secondary mt-1">
          All AI models are accessed through OpenRouter. Add your API key to get started.
        </p>
      </div>

      {isLoadingProvider ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : provider ? (
        <Card padding="lg">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🌐</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-medium text-text-primary">OpenRouter</h4>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    provider.isConfigured
                      ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                      : 'bg-surface-4'
                  }`}
                  title={provider.isConfigured ? 'Connected' : 'No API key'}
                />
                {provider.isConfigured && <span className="text-xs text-green-400">Connected</span>}
              </div>

              <MaskedField
                label="API Key"
                value={rawKey ?? ''}
                maskedValue={provider.maskedKey || 'Not configured'}
                editable
                onSave={(key) => handleSaveKey(provider.id, key)}
              />

              <p className="mt-2 text-xs text-text-tertiary">
                Get your API key at{' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  openrouter.ai/keys
                </a>
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Section 2: Model Catalog */}
      {provider?.isConfigured && <ModelCatalogSection catalog={catalog} />}
    </div>
  );
}

// ------------------------------------------------------------------
// Model Catalog Section
// ------------------------------------------------------------------

interface ModelCatalogSectionProps {
  catalog: ReturnType<typeof useModelCatalog>;
}

function ModelCatalogSection({ catalog }: ModelCatalogSectionProps) {
  const {
    catalog: models,
    isLoading,
    isSyncing,
    search,
    setSearch,
    providerFilter,
    setProviderFilter,
    providerSlugs,
    enabledCount,
    syncCatalog,
    toggleModel,
  } = catalog;

  const [syncResult, setSyncResult] = useState<{ added: number; updated: number } | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSync = async () => {
    setSyncResult(null);
    const result = await syncCatalog();
    setSyncResult(result);
    setTimeout(() => setSyncResult(null), 5000);
  };

  const handleToggle = async (model: OpenRouterCatalogModel) => {
    setToggleError(null);
    try {
      await toggleModel(model.modelId, !model.isEnabled);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Toggle failed';
      setToggleError(message);
      setTimeout(() => setToggleError(null), 3000);
    }
  };

  // Count enabled per provider for the dropdown labels
  const enabledByProvider: Record<string, { enabled: number; total: number }> = {};
  for (const m of models) {
    const entry = (enabledByProvider[m.providerSlug] ??= { enabled: 0, total: 0 });
    entry.total++;
    if (m.isEnabled) entry.enabled++;
  }

  // Models to show (only when a provider is selected or search is active)
  const showModels = providerFilter || search.length >= 2;
  const visibleModels = showModels ? models : [];

  // Format provider slug for display
  const formatSlug = (slug: string) =>
    slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Model Catalog</h3>
          <p className="text-sm text-text-secondary">
            {enabledCount} model{enabledCount !== 1 ? 's' : ''} enabled
            {models.length > 0 && ` of ${models.length} available`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent
                     hover:bg-accent/20 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Models'}
        </button>
      </div>

      {syncResult && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          Catalog synced: {syncResult.added} new, {syncResult.updated} updated
        </div>
      )}

      {toggleError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {toggleError}
        </div>
      )}

      {/* Provider dropdown + Search */}
      <div className="flex gap-3">
        {/* Provider family dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-2 px-4 py-2
                       text-sm text-text-primary hover:border-border-hover transition-colors min-w-[200px]"
          >
            <span className="flex-1 text-left">
              {providerFilter ? formatSlug(providerFilter) : 'Select model family...'}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-text-tertiary transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute z-50 mt-1 w-[280px] max-h-[360px] overflow-y-auto rounded-xl border border-border-hover
                            bg-surface-3 py-1 shadow-dark-lg backdrop-blur-glass"
            >
              {providerFilter && (
                <button
                  onClick={() => {
                    setProviderFilter(null);
                    setDropdownOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface-4 transition-colors"
                >
                  Clear selection
                </button>
              )}
              {providerSlugs.map((slug) => {
                const stats = enabledByProvider[slug];
                const isSelected = providerFilter === slug;
                return (
                  <button
                    key={slug}
                    onClick={() => {
                      setProviderFilter(slug);
                      setDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors
                      ${isSelected ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-surface-4'}`}
                  >
                    <span className="font-medium">{formatSlug(slug)}</span>
                    <span
                      className={`text-xs ${stats?.enabled ? 'text-accent' : 'text-text-tertiary'}`}
                    >
                      {stats?.enabled ?? 0}/{stats?.total ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Search within selected provider */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              providerFilter
                ? `Search ${formatSlug(providerFilter)} models...`
                : 'Search across all models...'
            }
            className="w-full rounded-lg border border-border-default bg-surface-2 py-2 pl-10 pr-4
                       text-sm text-text-primary placeholder:text-text-tertiary
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      {/* Model list — only shown when provider selected or searching */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : !showModels ? (
        <div className="rounded-lg border border-border-default bg-surface-2/50 p-8 text-center">
          <p className="text-text-secondary">
            Select a model family from the dropdown to browse and enable models.
          </p>
          <p className="text-xs text-text-tertiary mt-2">
            Or type 2+ characters to search across all providers.
          </p>
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="rounded-lg border border-border-default bg-surface-2 p-8 text-center">
          <p className="text-text-secondary">
            No models found. Click &ldquo;Sync Models&rdquo; to fetch from OpenRouter.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border-default bg-surface-2/50 backdrop-blur-sm overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border-default bg-surface-3/50 text-xs font-medium text-text-tertiary">
            <div className="w-5" />
            <div className="flex-1">Model</div>
            <div className="hidden sm:block w-14 text-right">Context</div>
            <div className="w-28 text-right">$/1M in / out</div>
          </div>

          {visibleModels.map((model) => (
            <ModelRow key={model.id} model={model} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Model Row
// ------------------------------------------------------------------

interface ModelRowProps {
  model: OpenRouterCatalogModel;
  onToggle: (model: OpenRouterCatalogModel) => void;
}

function ModelRow({ model, onToggle }: ModelRowProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-b-0
                   hover:bg-surface-3/30 transition-colors ${model.isEnabled ? '' : 'opacity-60'}`}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(model)}
        className="flex-shrink-0"
        title={model.isEnabled ? 'Disable model' : 'Enable model'}
      >
        {model.isEnabled ? (
          <ToggleRight className="h-5 w-5 text-accent" />
        ) : (
          <ToggleLeft className="h-5 w-5 text-text-tertiary" />
        )}
      </button>

      {/* Model info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {model.displayName}
          </span>
          {model.supportsVision && (
            <span title="Vision" className="flex-shrink-0">
              <Eye className="h-3.5 w-3.5 text-blue-400" />
            </span>
          )}
          {model.supportsImageGen && (
            <span title="Image Generation" className="flex-shrink-0">
              <Image className="h-3.5 w-3.5 text-purple-400" />
            </span>
          )}
        </div>
        <p className="text-xs text-text-tertiary truncate">{model.modelId}</p>
      </div>

      {/* Context length */}
      <div className="hidden sm:block flex-shrink-0 text-right w-14">
        <span className="text-xs text-text-tertiary">
          {model.contextLength >= 1_000_000
            ? `${(model.contextLength / 1_000_000).toFixed(1)}M`
            : `${Math.round(model.contextLength / 1000)}K`}
        </span>
      </div>

      {/* Pricing */}
      <div className="flex-shrink-0 text-right w-28">
        <span className="text-xs text-text-secondary">
          ${model.inputCostPerM.toFixed(2)} / ${model.outputCostPerM.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
