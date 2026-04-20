import { useCallback, useState } from 'react';
import axios from 'axios';
import type { CreateRelationshipInput, Relationship, UpdateRelationshipInput } from '@cc/shared';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';

/**
 * Model Studio — relationship CRUD + FK-graph inference + entity impact.
 *
 * Shape anchor: `useAttributes.ts`. Every mutation mirrors the same
 * optimistic-update + rollback + toast pattern.
 *
 * 6A (version): `update(...)` accepts a `clientVersion` arg and the
 * server returns a 409 with `{ code: 'VERSION_CONFLICT', serverVersion }`
 * on stale patches — we surface that via a toast and return the server
 * version so the caller can refresh.
 *
 * 5A (infer): the inference endpoint is sync for ≤2000 FK attrs (`async:
 * false` + `proposals`) and 202/async for larger models (`async: true` +
 * `jobId`). This hook transparently returns both shapes — the panel
 * component decides whether to poll.
 *
 * Error contract: all catches narrow on `axios.isAxiosError` + specific
 * status codes (per alignment-step6.md §5). No `catch (e: any)` anywhere.
 */

/** Local copy of the inferred-proposal shape from
 *  `model-studio-relationship-infer.service.ts`. Duplicated here because
 *  importing from the server package would create a client→server
 *  dependency edge. The shape is contract-locked by Phase 3. */
export interface InferredProposal {
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  sourceCardinality: Relationship['sourceCardinality'];
  targetCardinality: Relationship['targetCardinality'];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface InferResult {
  /** true → async job queued (>2000 attrs). Caller polls via jobId. */
  async?: boolean;
  /** Populated when `async` is false or absent. */
  proposals?: InferredProposal[];
  /** Populated when `async` is true. */
  jobId?: string;
  /** Sync warnings: dangling FKs, skipped proposals. */
  warnings?: string[];
}

export interface EntityRelationshipImpact {
  relationshipIds: string[];
  count: number;
}

interface ListResponse {
  relationships: Relationship[];
  total: number;
}

interface ServerErrorBody {
  success: false;
  error?: string;
  details?: {
    code?: string[];
    serverVersion?: string[];
  };
}

/** Narrow an axios error + parse the `details` bag shape our server
 *  uses. Returns `null` when the error isn't a structured server error. */
function readServerError(err: unknown): ServerErrorBody | null {
  if (!axios.isAxiosError(err)) return null;
  const body = err.response?.data as unknown;
  if (
    body === null ||
    typeof body !== 'object' ||
    !('success' in body) ||
    (body as { success: unknown }).success !== false
  ) {
    return null;
  }
  return body as ServerErrorBody;
}

/** True when the server returned a 409 VERSION_CONFLICT with the
 *  `serverVersion` detail populated. */
function isVersionConflict(err: unknown): err is { response: { status: 409 } } & Error {
  if (!axios.isAxiosError(err)) return false;
  if (err.response?.status !== 409) return false;
  const body = readServerError(err);
  const code = body?.details?.code?.[0];
  return code === 'VERSION_CONFLICT';
}

function extractServerVersion(err: unknown): number | null {
  const body = readServerError(err);
  const raw = body?.details?.serverVersion?.[0];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function errorMessage(err: unknown, fallback: string): string {
  const body = readServerError(err);
  if (body?.error) return body.error;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** 409 result surface. The UI can refresh from the returned version. */
export interface VersionConflictResult {
  conflict: true;
  serverVersion: number | null;
}

export type UpdateResult = Relationship | VersionConflictResult;

export function isVersionConflictResult(r: UpdateResult): r is VersionConflictResult {
  return (r as VersionConflictResult).conflict === true;
}

export function useRelationships(modelId: string | undefined) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const base = useCallback(
    (rest = '') => `/model-studio/models/${modelId}/relationships${rest}`,
    [modelId],
  );

  const loadAll = useCallback(async () => {
    if (!modelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: ListResponse }>(base());
      setRelationships(data?.data?.relationships ?? []);
    } catch (err) {
      const msg = errorMessage(err, 'Failed to load relationships');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [modelId, base]);

  const create = useCallback(
    async (input: CreateRelationshipInput): Promise<Relationship> => {
      if (!modelId) throw new Error('No model selected');
      // Optimistic insert: stamp a tempId so we can locate + replace or
      // remove the row after the server round-trip resolves. The tempId
      // is prefixed so nothing confuses it with a real UUID.
      const tempId = `temp-${
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      }`;
      const now = new Date().toISOString();
      const optimistic: Relationship = {
        id: tempId,
        dataModelId: modelId,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
        name: input.name ?? null,
        sourceCardinality: input.sourceCardinality,
        targetCardinality: input.targetCardinality,
        isIdentifying: input.isIdentifying,
        layer: input.layer,
        metadata: input.metadata ?? {},
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      setRelationships((prev) => [...prev, optimistic]);
      setIsMutating(true);
      try {
        const { data } = await api.post<{ data: Relationship }>(base(), input);
        const created = data.data;
        setRelationships((prev) => prev.map((r) => (r.id === tempId ? created : r)));
        return created;
      } catch (err) {
        // Rollback: drop the zombie edge so the canvas stays consistent.
        setRelationships((prev) => prev.filter((r) => r.id !== tempId));
        const msg = errorMessage(err, 'Failed to create relationship');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, base, toast],
  );

  const update = useCallback(
    async (
      relId: string,
      input: Omit<UpdateRelationshipInput, 'version'>,
      clientVersion: number,
    ): Promise<UpdateResult> => {
      if (!modelId) throw new Error('No model selected');
      setIsMutating(true);
      try {
        const { data } = await api.patch<{ data: Relationship }>(base(`/${relId}`), {
          ...input,
          version: clientVersion,
        });
        const updated = data.data;
        setRelationships((prev) => prev.map((r) => (r.id === relId ? updated : r)));
        return updated;
      } catch (err) {
        if (isVersionConflict(err)) {
          const serverVersion = extractServerVersion(err);
          toast('Someone else edited — refresh', 'error');
          return { conflict: true, serverVersion };
        }
        const msg = errorMessage(err, 'Failed to update relationship');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, base, toast],
  );

  const remove = useCallback(
    async (relId: string): Promise<void> => {
      if (!modelId) throw new Error('No model selected');
      const prevSnapshot = relationships;
      // Optimistic delete: drop from local state first, re-insert on
      // error so the edge doesn't flash back visibly after success.
      setRelationships((prev) => prev.filter((r) => r.id !== relId));
      setIsMutating(true);
      try {
        await api.delete(base(`/${relId}`));
      } catch (err) {
        setRelationships(prevSnapshot);
        const msg = errorMessage(err, 'Failed to delete relationship');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, base, toast, relationships],
  );

  const inferFromFkGraph = useCallback(async (): Promise<InferResult> => {
    if (!modelId) throw new Error('No model selected');
    setIsMutating(true);
    try {
      const { data } = await api.post<{ data: InferResult }>(base('/infer'));
      return data.data;
    } catch (err) {
      const msg = errorMessage(err, 'Failed to infer relationships');
      toast(msg, 'error');
      throw err instanceof Error ? err : new Error(msg);
    } finally {
      setIsMutating(false);
    }
  }, [modelId, base, toast]);

  const getEntityImpact = useCallback(
    async (entityId: string): Promise<EntityRelationshipImpact> => {
      if (!modelId) throw new Error('No model selected');
      try {
        const { data } = await api.get<{ data: EntityRelationshipImpact }>(
          `/model-studio/models/${modelId}/entities/${entityId}/impact`,
        );
        return data.data;
      } catch (err) {
        const msg = errorMessage(err, 'Failed to compute impact');
        toast(msg, 'error');
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    [modelId, toast],
  );

  return {
    relationships,
    isLoading,
    isMutating,
    error,
    loadAll,
    create,
    update,
    remove,
    inferFromFkGraph,
    getEntityImpact,
  };
}
