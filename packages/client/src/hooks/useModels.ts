import { useCallback, useEffect, useState } from 'react';
import type { ModelCreate, ModelUpdate } from '@cc/shared';
import { api } from '../lib/api';

/**
 * Model Studio — data_models CRUD from the client.
 *
 * Shape mirrors the server's DataModel row (via Drizzle $inferSelect).
 * We keep the type local as an interface to avoid re-exporting server
 * types across the wire.
 */

export interface DataModelSummary {
  id: string;
  projectId: string;
  ownerId: string;
  name: string;
  description: string | null;
  activeLayer: 'conceptual' | 'logical' | 'physical';
  notation: 'ie' | 'idef1x';
  originDirection: 'greenfield' | 'existing_system';
  metadata: Record<string, unknown>;
  tags: string[];
  lastExportedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Hierarchy context hydrated by the server so the UI can always
  // show "who owns it" — Org → Client → Project → Model trust chain.
  projectName: string;
  organisationId: string | null;
  organisationName: string | null;
  clientId: string | null;
  clientName: string | null;
  ownerName: string | null;
}

interface ListResponse {
  models: DataModelSummary[];
  total: number;
}

export function useModels() {
  const [models, setModels] = useState<DataModelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: ListResponse }>('/model-studio/models');
      setModels(data?.data?.models ?? []);
      setTotal(data?.data?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (input: ModelCreate): Promise<DataModelSummary> => {
    const { data } = await api.post<{ data: DataModelSummary }>('/model-studio/models', input);
    const created = data.data;
    setModels((prev) => [created, ...prev]);
    setTotal((t) => t + 1);
    return created;
  }, []);

  const update = useCallback(async (id: string, patch: ModelUpdate): Promise<DataModelSummary> => {
    const { data } = await api.patch<{ data: DataModelSummary }>(
      `/model-studio/models/${id}`,
      patch,
    );
    const updated = data.data;
    setModels((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await api.delete(`/model-studio/models/${id}`);
    setModels((prev) => prev.filter((m) => m.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  return { models, total, isLoading, error, refresh, create, update, remove };
}
