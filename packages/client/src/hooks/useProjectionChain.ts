import { useCallback, useState } from 'react';
import type { ProjectionChainResponse } from '@cc/shared';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-errors';

/**
 * Step 7 — projection-chain resolver hook.
 *
 * Maintains a per-entityId cache of resolved chains so the breadcrumb
 * component + linked-objects panel can share lookups without
 * round-tripping twice. Invalidation is caller-driven: after any
 * layer-link create/delete, invoke `invalidate(entityId)` (or
 * `invalidateAll()`) so the next render refetches.
 *
 * The response shape is adjacency-list: flat `nodes[]` with each node
 * carrying `parentIds` + `childIds` so UI can do lookup-by-id cheaply.
 */

interface ChainResponse {
  data: ProjectionChainResponse;
}

export interface UseProjectionChainApi {
  /** Cached chains keyed by root entity id. */
  chains: Record<string, ProjectionChainResponse>;
  isLoading: boolean;
  error: string | null;
  loadChain(entityId: string): Promise<ProjectionChainResponse | null>;
  /** Drop one entity's chain from cache. Next `loadChain` refetches. */
  invalidate(entityId: string): void;
  /** Drop the entire cache. Used when a layer-link mutation happens. */
  invalidateAll(): void;
}

export function useProjectionChain(modelId: string | undefined): UseProjectionChainApi {
  const [chains, setChains] = useState<Record<string, ProjectionChainResponse>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChain = useCallback(
    async (entityId: string): Promise<ProjectionChainResponse | null> => {
      if (!modelId) return null;
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ChainResponse>(
          `/model-studio/models/${modelId}/entities/${entityId}/projection-chain`,
        );
        const chain = data.data;
        setChains((prev) => ({ ...prev, [entityId]: chain }));
        return chain;
      } catch (err) {
        setError(errorMessage(err, 'Failed to load projection chain'));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [modelId],
  );

  const invalidate = useCallback((entityId: string) => {
    setChains((prev) => {
      if (!(entityId in prev)) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [entityId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const invalidateAll = useCallback(() => {
    setChains({});
  }, []);

  return { chains, isLoading, error, loadChain, invalidate, invalidateAll };
}
