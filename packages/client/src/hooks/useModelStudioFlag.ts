import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

/**
 * Reads the `enable_model_studio` feature flag from the server.
 *
 * Used by:
 *  - ModelStudioPage  → render "Coming soon" stub when OFF,
 *                       empty-state launch page when ON.
 *  - Sidebar (future) → hide the Model Studio nav entry when OFF.
 *
 * Returns `{ enabled, isLoading, refresh, setEnabled }`.
 * `setEnabled` is admin-only on the server; non-admins get 403.
 */
export function useModelStudioFlag() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/model-studio/flag');
      setEnabled(Boolean(data?.data?.enabled));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setEnabledRemote = useCallback(async (next: boolean) => {
    const { data } = await api.put('/model-studio/flag', { enabled: next });
    const value = Boolean(data?.data?.enabled);
    setEnabled(value);
    return value;
  }, []);

  return { enabled, isLoading, refresh, setEnabled: setEnabledRemote };
}
