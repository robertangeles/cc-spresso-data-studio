import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface ConfiguredModel {
  model: string;
  displayName: string;
  description: string;
  provider: string;
  providerType: string;
  providerSlug?: string;
  icon: string;
}

export function useConfiguredModels() {
  const [models, setModels] = useState<ConfiguredModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/admin/ai-providers/configured');
      setModels(data.data);
    } catch {
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, isLoading, refresh };
}
