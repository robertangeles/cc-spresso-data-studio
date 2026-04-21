import { useCallback, useEffect, useState } from 'react';
import type { EntityCreate, EntityUpdate, Layer, NamingLintRule } from '@cc/shared';
import { api } from '../lib/api';

/**
 * Model Studio — entity CRUD + auto-describe from the client.
 *
 * Mirrors the server's EntityWithLint shape: every entity ships with a
 * naming-lint result so the canvas / detail panel can render amber
 * underlines without a second round trip.
 */

export interface EntitySummary {
  id: string;
  dataModelId: string;
  name: string;
  businessName: string | null;
  description: string | null;
  layer: Layer;
  entityType: 'standard' | 'associative' | 'subtype' | 'supertype';
  /** Step 6 Direction A — server-assigned monotonic display id
   *  (`E001`, `E002`, …). Rendered as a subtle mono chip in the top-
   *  right of the entity card so senior modellers can cite it in
   *  governance artefacts without chasing a UUID. */
  displayId: string | null;
  /** Step 6 Direction A follow-up — optional one-line "purpose" label
   *  per AK group, keyed by `AK1`, `AK2`, …. Surfaces as a tooltip on
   *  the AK badge + becomes the DDL constraint name at export time.
   *  Empty map (`{}`) = no labels set on any AK group. */
  altKeyLabels: Record<string, string>;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lint: NamingLintRule[];
}

interface ListResponse {
  entities: EntitySummary[];
  total: number;
}

interface DependentSummary {
  attributes: number;
  relationships: number;
  layerLinks: number;
}

export interface DeleteResult {
  deleted: true;
  cascaded: DependentSummary;
}

interface AutoDescribeResponse {
  entity: EntitySummary;
  description: string;
}

export function useEntities(modelId: string | undefined) {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!modelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: ListResponse }>(
        `/model-studio/models/${modelId}/entities`,
      );
      setEntities(data?.data?.entities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entities');
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: EntityCreate): Promise<EntitySummary> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.post<{ data: EntitySummary }>(
        `/model-studio/models/${modelId}/entities`,
        input,
      );
      const created = data.data;
      setEntities((prev) => [created, ...prev]);
      return created;
    },
    [modelId],
  );

  const update = useCallback(
    async (entityId: string, patch: EntityUpdate): Promise<EntitySummary> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.patch<{ data: EntitySummary }>(
        `/model-studio/models/${modelId}/entities/${entityId}`,
        patch,
      );
      const updated = data.data;
      setEntities((prev) => prev.map((e) => (e.id === entityId ? updated : e)));
      return updated;
    },
    [modelId],
  );

  const remove = useCallback(
    async (entityId: string, opts: { cascade?: boolean } = {}): Promise<DeleteResult> => {
      if (!modelId) throw new Error('No model selected');
      const qs = opts.cascade ? '?confirm=cascade' : '';
      const { data } = await api.delete<{ data: DeleteResult }>(
        `/model-studio/models/${modelId}/entities/${entityId}${qs}`,
      );
      setEntities((prev) => prev.filter((e) => e.id !== entityId));
      return data.data;
    },
    [modelId],
  );

  const autoDescribe = useCallback(
    async (entityId: string): Promise<AutoDescribeResponse> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.post<{ data: AutoDescribeResponse }>(
        `/model-studio/models/${modelId}/entities/${entityId}/auto-describe`,
        {},
      );
      const updated = data.data.entity;
      setEntities((prev) => prev.map((e) => (e.id === entityId ? updated : e)));
      return data.data;
    },
    [modelId],
  );

  return { entities, isLoading, error, refresh, create, update, remove, autoDescribe };
}
