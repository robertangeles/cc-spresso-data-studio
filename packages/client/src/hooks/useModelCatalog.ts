import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { OpenRouterCatalogModel } from '@cc/shared';

export function useModelCatalog() {
  const [catalog, setCatalog] = useState<OpenRouterCatalogModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (providerFilter) params.set('provider', providerFilter);
      const qs = params.toString();
      const { data } = await api.get(`/admin/ai-providers/catalog${qs ? `?${qs}` : ''}`);
      setCatalog(data.data);
    } catch {
      setCatalog([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, providerFilter]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const syncCatalog = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { data } = await api.post('/admin/ai-providers/sync-catalog');
      await fetchCatalog();
      return data.data as { added: number; updated: number };
    } finally {
      setIsSyncing(false);
    }
  }, [fetchCatalog]);

  const toggleModel = useCallback(async (modelId: string, enabled: boolean) => {
    try {
      const { data } = await api.patch(
        `/admin/ai-providers/catalog/${encodeURIComponent(modelId)}/toggle`,
        { enabled },
      );
      setCatalog((prev) => prev.map((m) => (m.modelId === modelId ? data.data : m)));
      return data.data as OpenRouterCatalogModel;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Toggle failed';
      throw new Error(message);
    }
  }, []);

  const batchToggle = useCallback(
    async (modelIds: string[], enabled: boolean) => {
      await api.patch('/admin/ai-providers/catalog/batch-toggle', { modelIds, enabled });
      await fetchCatalog();
    },
    [fetchCatalog],
  );

  // Derive unique provider slugs for filter chips
  const providerSlugs = [...new Set(catalog.map((m) => m.providerSlug))].sort();

  const enabledCount = catalog.filter((m) => m.isEnabled).length;

  return {
    catalog,
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
    batchToggle,
    refresh: fetchCatalog,
  };
}
