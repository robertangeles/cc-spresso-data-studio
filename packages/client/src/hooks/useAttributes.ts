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
  /** Step 6 follow-up — true when the user explicitly toggled UQ (not
   *  coerced by PK or AK). Used by the Key Columns panel to decide
   *  whether this attr should be surfaced as a candidate-key source. */
  isExplicitUnique: boolean;
  defaultValue: string | null;
  classification: string | null;
  transformationLogic: string | null;
  /** Step 6 Direction A — alt-key group label (`AK1`, `AK2`, …) when
   *  this attribute participates in a composite business key. `null`
   *  when the attribute is not part of a BK. */
  altKeyGroup: string | null;
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

interface BatchResponse {
  attributesByEntity: Record<string, AttributeSummary[]>;
  total: number;
}

export interface AttributeHistoryEvent {
  id: string;
  action: string;
  changedBy: string;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
}

interface HistoryResponse {
  events: AttributeHistoryEvent[];
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
  const [historyByAttrId, setHistoryByAttrId] = useState<Record<string, AttributeHistoryEvent[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useCallback(
    (entityId: string, rest = '') =>
      `/model-studio/models/${modelId}/entities/${entityId}/attributes${rest}`,
    [modelId],
  );

  /** Single per-entity fetch. Kept for edge cases (e.g. after a
   *  stale-state reconciliation) — the canvas relies on `loadAll`. */
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

  /** Model-wide batch preload. Called by the canvas on mount so every
   *  EntityNode can render PKs on first paint without clicking. Lint
   *  is skipped here to keep the payload small (~150KB on 50 entities);
   *  the editor re-loads per-attribute lint when it opens. */
  const loadAll = useCallback(async () => {
    if (!modelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: BatchResponse }>(
        `/model-studio/models/${modelId}/attributes`,
      );
      setAttributesByEntity(data?.data?.attributesByEntity ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attributes');
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

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
      // PK demotion on the server cascades into deleting propagated FKs
      // on downstream target entities. The client can't know which
      // entities were affected without a second call — refetch the
      // whole model's attrs to reconcile. Bounded by model size.
      if (patch.isPrimaryKey === false) {
        try {
          const { data: batch } = await api.get<{ data: BatchResponse }>(
            `/model-studio/models/${modelId}/attributes`,
          );
          setAttributesByEntity(batch?.data?.attributesByEntity ?? {});
        } catch {
          // Swallow — the next user action will naturally refetch.
        }
      }
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
      let result: DeleteAttributeResult = {
        deleted: true,
        cascaded: { attributeLinks: 0, semanticMappings: 0 },
      };
      try {
        const { data } = await api.delete<{ data: DeleteAttributeResult }>(
          base(entityId, `/${attrId}${qs}`),
        );
        result = data.data;
      } catch (err) {
        // 404 = attribute already gone (typically cleaned up server-side
        // by a prior mutation: PK demotion removing a propagated FK, or
        // relationship delete unwinding an auto-FK). Treat as success;
        // the local state drop below reconciles the stale client cache.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 404) throw err;
      }
      setAttributesByEntity((prev) => {
        const list = prev[entityId] ?? [];
        return {
          ...prev,
          [entityId]: list.filter((a) => a.id !== attrId),
        };
      });
      return result;
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

  /** Fetch history for a single attribute (change_log events). Cached
   *  per attrId for the panel lifetime; invalidated on mutation of that
   *  attribute. Feeds the Erwin History tab. */
  const loadHistory = useCallback(
    async (entityId: string, attrId: string): Promise<AttributeHistoryEvent[]> => {
      if (!modelId) return [];
      if (historyByAttrId[attrId]) return historyByAttrId[attrId];
      const { data } = await api.get<{ data: HistoryResponse }>(
        base(entityId, `/${attrId}/history`),
      );
      const events = data?.data?.events ?? [];
      setHistoryByAttrId((prev) => ({ ...prev, [attrId]: events }));
      return events;
    },
    [modelId, base, historyByAttrId],
  );

  const invalidateHistory = useCallback((attrId: string) => {
    setHistoryByAttrId((prev) => {
      if (!(attrId in prev)) return prev;
      const next = { ...prev };
      delete next[attrId];
      return next;
    });
  }, []);

  return {
    attributesByEntity,
    getFor,
    isLoading,
    error,
    load,
    loadAll,
    create,
    update,
    remove,
    reorder,
    generateSyntheticData,
    loadHistory,
    invalidateHistory,
  };
}
