import { useCallback, useState } from 'react';
import type { LayerLink } from '@cc/shared';
import { api } from '../lib/api';
import { errorMessage, isStatus } from '../lib/api-errors';
import { useToast } from '../components/ui/Toast';

/**
 * Step 7 — entity-level layer_links CRUD hook.
 *
 * Shape-anchor: `useRelationships.ts`. Mirrors its optimistic + rollback +
 * toast pattern. Keyed on `modelId` — all paths are nested under
 * `/api/model-studio/models/:modelId/layer-links`.
 *
 * Notable: there's no PATCH (links are immutable; to "change" a link,
 * delete + create). No optimistic-insert id-replace dance for
 * `loadByEntity` flows either — those are pure reads.
 */

interface ListResponse {
  data: LayerLink[];
}

interface CreateResponse {
  data: LayerLink;
}

export interface UseLayerLinksApi {
  /** All layer-links loaded so far for any entity in the model.
   *  Keyed by parent+child so we can deduplicate on refresh. */
  links: LayerLink[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  /** Load every link where `entityId` is the parent. Replaces the cache
   *  with fresh rows for those parent→child pairs. */
  loadByParent(entityId: string): Promise<LayerLink[]>;
  /** Mirror of loadByParent for the child direction. */
  loadByChild(entityId: string): Promise<LayerLink[]>;
  create(parentId: string, childId: string): Promise<LayerLink>;
  delete(linkId: string): Promise<void>;
}

export function useLayerLinks(modelId: string | undefined): UseLayerLinksApi {
  const [links, setLinks] = useState<LayerLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const basePath = useCallback(() => `/model-studio/models/${modelId}/layer-links`, [modelId]);

  const mergeRows = useCallback((incoming: LayerLink[]) => {
    // Deduplicate by link id — incoming rows overwrite cached copies.
    setLinks((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]));
      for (const row of incoming) byId.set(row.id, row);
      return Array.from(byId.values());
    });
  }, []);

  const loadByParent = useCallback(
    async (entityId: string): Promise<LayerLink[]> => {
      if (!modelId) return [];
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ListResponse>(`${basePath()}?parentId=${entityId}`);
        const rows = data.data ?? [];
        mergeRows(rows);
        return rows;
      } catch (err) {
        const msg = errorMessage(err, 'Failed to load layer links');
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, basePath, mergeRows],
  );

  const loadByChild = useCallback(
    async (entityId: string): Promise<LayerLink[]> => {
      if (!modelId) return [];
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ListResponse>(`${basePath()}?childId=${entityId}`);
        const rows = data.data ?? [];
        mergeRows(rows);
        return rows;
      } catch (err) {
        const msg = errorMessage(err, 'Failed to load layer links');
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, basePath, mergeRows],
  );

  const create = useCallback(
    async (parentId: string, childId: string): Promise<LayerLink> => {
      if (!modelId) throw new Error('No model selected');
      setIsMutating(true);
      try {
        const { data } = await api.post<CreateResponse>(basePath(), { parentId, childId });
        const created = data.data;
        setLinks((prev) => [...prev, created]);
        return created;
      } catch (err) {
        // 409 = "Already linked" or "retry please" (post-SERIALIZABLE).
        // 400 = same-layer / cycle — surface the server's details message.
        const msg = errorMessage(err, 'Failed to create layer link');
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
      // Optimistic removal — rollback on error.
      const snapshot = links;
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      setIsMutating(true);
      try {
        await api.delete(`${basePath()}/${linkId}`);
      } catch (err) {
        // 404 means someone else (or this tab's cross-tab peer) already
        // deleted it — silently accept the optimistic removal. For any
        // other error, roll back AND surface the toast.
        if (isStatus(err, 404)) {
          return;
        }
        setLinks(snapshot);
        const msg = errorMessage(err, 'Failed to delete layer link');
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
