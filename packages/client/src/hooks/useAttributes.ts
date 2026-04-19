import { useCallback, useState } from 'react';
import type { AttributeCreate, AttributeUpdate, NamingLintRule } from '@cc/shared';
import { api } from '../lib/api';

/**
 * Model Studio — attribute CRUD + D9 synthetic data.
 *
 * Unlike useEntities (which fetches everything in one go), the
 * attribute hook lazily loads attributes for a given entityId on
 * demand — typically when the detail panel opens for that entity.
 * This keeps canvas mount time bounded even on large models.
 *
 * The canvas that mounts this hook is the single source of truth for
 * `attributesByEntity`, so any node on the canvas can read its
 * attributes from the map (used by EntityNode to render PKs above
 * the divider line).
 *
 * TODO(step-5-follow-up): add a model-wide batch endpoint so attrs
 * for every entity load once on canvas mount, not lazy-per-selection.
 */

export interface AttributeSummary {
  id: string;
  entityId: string;
  name: string;
  businessName: string | null;
  description: string | null;
  dataType: string | null;
  length: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lint: NamingLintRule[];
}

export interface SyntheticDataResult {
  synthetic: true;
  entityId: string;
  entityName: string;
  rows: Record<string, unknown>[];
  attributeNames: string[];
  generatedAt: string;
  modelUsed: string;
}

interface ListResponse {
  attributes: AttributeSummary[];
  total: number;
}

interface ReorderResponse {
  attributes: AttributeSummary[];
}

export interface AttributeDependents {
  attributeLinks: number;
  semanticMappings: number;
}

export interface DeleteAttributeResult {
  deleted: true;
  cascaded: AttributeDependents;
}

export function useAttributes(modelId: string | undefined) {
  const [attributesByEntity, setAttributesByEntity] = useState<Record<string, AttributeSummary[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useCallback(
    (entityId: string, rest = '') =>
      `/model-studio/models/${modelId}/entities/${entityId}/attributes${rest}`,
    [modelId],
  );

  const load = useCallback(
    async (entityId: string) => {
      if (!modelId) return;
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<{ data: ListResponse }>(base(entityId));
        setAttributesByEntity((prev) => ({
          ...prev,
          [entityId]: data?.data?.attributes ?? [],
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load attributes');
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, base],
  );

  const create = useCallback(
    async (entityId: string, dto: AttributeCreate): Promise<AttributeSummary> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.post<{ data: AttributeSummary }>(base(entityId), dto);
      const created = data.data;
      setAttributesByEntity((prev) => {
        const list = prev[entityId] ?? [];
        return { ...prev, [entityId]: [...list, created] };
      });
      return created;
    },
    [modelId, base],
  );

  const update = useCallback(
    async (entityId: string, attrId: string, patch: AttributeUpdate): Promise<AttributeSummary> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.patch<{ data: AttributeSummary }>(
        base(entityId, `/${attrId}`),
        patch,
      );
      const updated = data.data;
      setAttributesByEntity((prev) => {
        const list = prev[entityId] ?? [];
        return {
          ...prev,
          [entityId]: list.map((a) => (a.id === attrId ? updated : a)),
        };
      });
      return updated;
    },
    [modelId, base],
  );

  const remove = useCallback(
    async (
      entityId: string,
      attrId: string,
      opts: { cascade?: boolean } = {},
    ): Promise<DeleteAttributeResult> => {
      if (!modelId) throw new Error('No model selected');
      const qs = opts.cascade ? '?confirm=cascade' : '';
      const { data } = await api.delete<{ data: DeleteAttributeResult }>(
        base(entityId, `/${attrId}${qs}`),
      );
      setAttributesByEntity((prev) => {
        const list = prev[entityId] ?? [];
        return {
          ...prev,
          [entityId]: list.filter((a) => a.id !== attrId),
        };
      });
      return data.data;
    },
    [modelId, base],
  );

  const reorder = useCallback(
    async (entityId: string, orderedIds: string[]): Promise<AttributeSummary[]> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.post<{ data: ReorderResponse }>(base(entityId, '/reorder'), {
        ids: orderedIds,
      });
      const next = data.data.attributes;
      setAttributesByEntity((prev) => ({ ...prev, [entityId]: next }));
      return next;
    },
    [modelId, base],
  );

  const generateSyntheticData = useCallback(
    async (entityId: string, count = 10): Promise<SyntheticDataResult> => {
      if (!modelId) throw new Error('No model selected');
      const { data } = await api.post<{ data: SyntheticDataResult }>(
        `/model-studio/models/${modelId}/entities/${entityId}/synthetic-data`,
        { count },
      );
      return data.data;
    },
    [modelId],
  );

  const getFor = useCallback(
    (entityId: string | null | undefined): AttributeSummary[] => {
      if (!entityId) return [];
      return attributesByEntity[entityId] ?? [];
    },
    [attributesByEntity],
  );

  return {
    attributesByEntity,
    getFor,
    isLoading,
    error,
    load,
    create,
    update,
    remove,
    reorder,
    generateSyntheticData,
  };
}
