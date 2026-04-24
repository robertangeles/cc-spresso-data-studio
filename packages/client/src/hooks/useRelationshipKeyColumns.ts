import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RelationshipKeyColumnPair,
  RelationshipKeyColumnsResponse,
  RelationshipKeyColumnsSet,
} from '@cc/shared';
import { api } from '../lib/api';

/**
 * Step 6+ — Relationship "Key Columns" hook.
 *
 * Fetches + mutates the source-PK → target-FK pair list for a single
 * relationship. On first load, if the server reports `needsBackfill=true`
 * (source has N PKs but fewer than N propagated FKs on the target — a
 * rel that predates this feature), we silently POST the current pair
 * list back so the server auto-creates the missing FKs, then re-GET
 * to pick up the reconciled state.
 *
 * Error handling: axios rejections land in `error` (string) — the panel
 * surfaces this as a banner. A 409 from POST (e.g. attr already tagged
 * for another rel) is included verbatim so the user can act on it.
 *
 * Undo: the panel wraps `setPair` in `useUndoStack().execute(...)`.
 * The inverse op POSTs the prev pair list.
 */

export interface UseRelationshipKeyColumnsApi {
  pairs: RelationshipKeyColumnPair[];
  sourceHasNoPk: boolean;
  /** Post-alt-key-FK semantic: true when source has NO PK AND no UQ
   *  AND no AK group. Optional on older server builds — callers should
   *  read `sourceHasNoCandidateKey ?? sourceHasNoPk`. */
  sourceHasNoCandidateKey?: boolean;
  isLoading: boolean;
  error: string | null;
  /** Update one source→target pair (null = auto-create). POSTs the
   *  full reconciled list to the server and refetches on success. */
  setPair: (sourceAttributeId: string, targetAttributeId: string | null) => Promise<void>;
  /** Remove the pair for a non-PK source attr (AK/UQ). Deletes any
   *  auto-propagated FK and strips manual tags on the target. */
  removePair: (sourceAttributeId: string) => Promise<void>;
  /** Force a re-GET — used after an out-of-band event (e.g. undo). */
  refetch: () => Promise<void>;
}

function errorToString(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useRelationshipKeyColumns(
  modelId: string | null,
  relId: string | null,
): UseRelationshipKeyColumnsApi {
  const [pairs, setPairs] = useState<RelationshipKeyColumnPair[]>([]);
  const [sourceHasNoPk, setSourceHasNoPk] = useState(false);
  const [sourceHasNoCandidateKey, setSourceHasNoCandidateKey] = useState<boolean | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest inflight (modelId, relId) so stale responses from
  // a previous relationship selection can't clobber the current view.
  const activeKeyRef = useRef<string | null>(null);

  const url = useCallback(() => {
    if (!modelId || !relId) return null;
    return `/model-studio/models/${modelId}/relationships/${relId}/key-columns`;
  }, [modelId, relId]);

  /** Raw fetch — does NOT trigger silent backfill. Used by `refetch()`
   *  and by the initial-load effect (which wraps this with backfill
   *  logic). Returns the response so callers can inspect `needsBackfill`. */
  const fetchOnce = useCallback(
    async (key: string, endpoint: string): Promise<RelationshipKeyColumnsResponse | null> => {
      try {
        const { data } = await api.get<{ data: RelationshipKeyColumnsResponse }>(endpoint);
        const body = data.data;
        if (activeKeyRef.current !== key) return null;
        setPairs(body.pairs);
        setSourceHasNoPk(body.sourceHasNoPk);
        setSourceHasNoCandidateKey(body.sourceHasNoCandidateKey);
        setError(null);
        return body;
      } catch (err) {
        if (activeKeyRef.current !== key) return null;
        setError(errorToString(err, 'Failed to load key columns'));
        return null;
      }
    },
    [],
  );

  const refetch = useCallback(async () => {
    const endpoint = url();
    if (!endpoint || !modelId || !relId) return;
    const key = `${modelId}::${relId}`;
    activeKeyRef.current = key;
    setIsLoading(true);
    try {
      await fetchOnce(key, endpoint);
    } finally {
      if (activeKeyRef.current === key) setIsLoading(false);
    }
  }, [url, modelId, relId, fetchOnce]);

  // Initial load + silent backfill.
  useEffect(() => {
    const endpoint = url();
    if (!endpoint || !modelId || !relId) {
      // Reset state when no rel is selected so a subsequent selection
      // doesn't flash stale data.
      activeKeyRef.current = null;
      setPairs([]);
      setSourceHasNoPk(false);
      setSourceHasNoCandidateKey(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }
    const key = `${modelId}::${relId}`;
    activeKeyRef.current = key;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const first = await fetchOnce(key, endpoint);
        if (cancelled || activeKeyRef.current !== key) return;
        if (first?.needsBackfill && !first.sourceHasNoPk) {
          // Silent backfill: POST with the current pairs so the server
          // auto-creates any missing FK attrs, then re-GET.
          const body: RelationshipKeyColumnsSet = {
            pairs: first.pairs.map((p) => ({
              sourceAttributeId: p.sourceAttributeId,
              targetAttributeId: p.targetAttributeId,
            })),
          };
          try {
            await api.post(endpoint, body);
            await fetchOnce(key, endpoint);
          } catch (postErr) {
            if (activeKeyRef.current === key) {
              setError(errorToString(postErr, 'Failed to backfill key columns'));
            }
          }
        }
      } finally {
        if (!cancelled && activeKeyRef.current === key) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, modelId, relId, fetchOnce]);

  const setPair = useCallback(
    async (sourceAttributeId: string, targetAttributeId: string | null) => {
      const endpoint = url();
      if (!endpoint || !modelId || !relId) return;
      const key = `${modelId}::${relId}`;
      // Build the full pair list with this one updated. Omit untouched
      // AK/UQ rows that are currently unpaired — otherwise the server
      // treats targetAttributeId=null as "auto-create" and would
      // materialise a new FK on target whenever another row changes.
      // PK rows are always included (backwards compat — PKs auto-create
      // or retain by default).
      const nextPairs: RelationshipKeyColumnsSet['pairs'] = pairs
        .map((p) => {
          if (p.sourceAttributeId === sourceAttributeId) {
            return { sourceAttributeId: p.sourceAttributeId, targetAttributeId };
          }
          return { sourceAttributeId: p.sourceAttributeId, targetAttributeId: p.targetAttributeId };
        })
        .filter((entry) => {
          const original = pairs.find((p) => p.sourceAttributeId === entry.sourceAttributeId);
          if (!original) return true;
          if (entry.sourceAttributeId === sourceAttributeId) return true;
          const role = original.sourceAttributeRole ?? 'pk';
          if (role === 'pk') return true;
          if (original.isAutoCreated) return true;
          if (original.targetAttributeId) return true;
          return false;
        });
      setError(null);
      try {
        const { data } = await api.post<{ data: RelationshipKeyColumnsResponse }>(endpoint, {
          pairs: nextPairs,
        });
        if (activeKeyRef.current !== key) return;
        const body = data.data;
        setPairs(body.pairs);
        setSourceHasNoPk(body.sourceHasNoPk);
        setSourceHasNoCandidateKey(body.sourceHasNoCandidateKey);
      } catch (err) {
        if (activeKeyRef.current === key) {
          setError(errorToString(err, 'Failed to update key columns'));
        }
        throw err;
      }
    },
    [url, modelId, relId, pairs],
  );

  const removePair = useCallback(
    async (sourceAttributeId: string) => {
      const endpoint = url();
      if (!endpoint || !modelId || !relId) return;
      const key = `${modelId}::${relId}`;
      // Body: a single remove directive for the source attr. Including
      // other pairs is unnecessary — the server treats absent rows as
      // "leave alone" for AK/UQ and "auto-retain" for PK.
      const body: RelationshipKeyColumnsSet = {
        pairs: [{ sourceAttributeId, targetAttributeId: null, remove: true }],
      };
      setError(null);
      try {
        const { data } = await api.post<{ data: RelationshipKeyColumnsResponse }>(endpoint, body);
        if (activeKeyRef.current !== key) return;
        const responseBody = data.data;
        setPairs(responseBody.pairs);
        setSourceHasNoPk(responseBody.sourceHasNoPk);
        setSourceHasNoCandidateKey(responseBody.sourceHasNoCandidateKey);
      } catch (err) {
        if (activeKeyRef.current === key) {
          setError(errorToString(err, 'Failed to remove key column pair'));
        }
        throw err;
      }
    },
    [url, modelId, relId],
  );

  return {
    pairs,
    sourceHasNoPk,
    sourceHasNoCandidateKey,
    isLoading,
    error,
    setPair,
    removePair,
    refetch,
  };
}
