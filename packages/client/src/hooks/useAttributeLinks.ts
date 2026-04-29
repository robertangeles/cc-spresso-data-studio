import { useCallback, useState } from 'react';
import type { AttributeLink } from '@cc/shared';
import { api } from '../lib/api';
import { errorMessage, isStatus } from '../lib/api-errors';
import { useToast } from '../components/ui/Toast';

/**
 * Step 7 — attribute_links CRUD hook. Parallel shape to `useLayerLinks`
 * but operates on `/model-studio/models/:modelId/attribute-links` at
 * the column grain.
 */

interface ListResponse {
  data: AttributeLink[];
}

interface CreateResponse {
  data: AttributeLink;
}

export interface UseAttributeLinksApi {
  links: AttributeLink[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  loadByParent(attributeId: string): Promise<AttributeLink[]>;
  loadByChild(attributeId: string): Promise<AttributeLink[]>;
  create(parentId: string, childId: string): Promise<AttributeLink>;
  delete(linkId: string): Promise<void>;
}

export function useAttributeLinks(modelId: string | undefined): UseAttributeLinksApi {
  const [links, setLinks] = useState<AttributeLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const basePath = useCallback(() => `/model-studio/models/${modelId}/attribute-links`, [modelId]);

  const mergeRows = useCallback((incoming: AttributeLink[]) => {
    setLinks((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]));
      for (const row of incoming) byId.set(row.id, row);
      return Array.from(byId.values());
    });
  }, []);

  const loadByParent = useCallback(
    async (attributeId: string): Promise<AttributeLink[]> => {
      if (!modelId) return [];
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ListResponse>(`${basePath()}?parentId=${attributeId}`);
        const rows = data.data ?? [];
        mergeRows(rows);
        return rows;
      } catch (err) {
        setError(errorMessage(err, 'Failed to load attribute links'));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, basePath, mergeRows],
  );

  const loadByChild = useCallback(
    async (attributeId: string): Promise<AttributeLink[]> => {
      if (!modelId) return [];
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ListResponse>(`${basePath()}?childId=${attributeId}`);
        const rows = data.data ?? [];
        mergeRows(rows);
        return rows;
      } catch (err) {
        setError(errorMessage(err, 'Failed to load attribute links'));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, basePath, mergeRows],
  );

  const create = useCallback(
    async (parentId: string, childId: string): Promise<AttributeLink> => {
      if (!modelId) throw new Error('No model selected');
      setIsMutating(true);
      try {
        const { data } = await api.post<CreateResponse>(basePath(), { parentId, childId });
        const created = data.data;
        setLinks((prev) => [...prev, created]);
        return created;
      } catch (err) {
        const msg = errorMessage(err, 'Failed to create attribute link');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, basePath, toast],
  );

  const del = useCallback(
    async (linkId: string): Promise<void> => {
      if (!modelId) throw new Error('No model selected');
      const snapshot = links;
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      setIsMutating(true);
      try {
        await api.delete(`${basePath()}/${linkId}`);
      } catch (err) {
        // 404 = already removed by a peer tab — accept the optimistic
        // removal silently. Anything else rolls back + surfaces a toast.
        if (isStatus(err, 404)) {
          return;
        }
        setLinks(snapshot);
        const msg = errorMessage(err, 'Failed to delete attribute link');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, basePath, links, toast],
  );

  return {
    links,
    isLoading,
    isMutating,
    error,
    loadByParent,
    loadByChild,
    create,
    delete: del,
  };
}
