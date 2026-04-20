import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { Layer, Notation } from '@cc/shared';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { useBroadcastCanvas } from './useBroadcastCanvas';

/**
 * Step 6 (1A + 7B) — per-user notation stored on `data_model_canvas_states`.
 *
 * - Initial value: GET `/api/model-studio/models/:id/canvas-state` which
 *   returns `{ notation, nodePositions, viewport, updatedAt }`.
 * - Update flow: optimistic local set → PUT the full canvas-state row
 *   (the endpoint is PUT/upsert) → broadcast via `useBroadcastCanvas`
 *   so peer tabs update without re-PUTting.
 * - Rollback on PUT failure: revert local state + error toast.
 *
 * We pass `layer` because the canvas-state row is keyed by
 * (userId, modelId, layer). Notation is stored at the same grain so a
 * modeller can prefer IE on the logical layer and IDEF1X on the physical.
 *
 * The GET response ships `nodePositions` + `viewport`; we retain a ref
 * to them so the PUT echoes back the full row and doesn't clobber the
 * modeller's layout just because they flipped notation.
 */

interface CanvasStateRow {
  notation?: Notation;
  nodePositions?: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
  updatedAt?: string | null;
}

interface GetCanvasStateResponse {
  data: CanvasStateRow;
}

interface PutCanvasStateResponse {
  data: CanvasStateRow;
}

const DEFAULT_NOTATION: Notation = 'ie';

export interface UseNotationApi {
  notation: Notation;
  setNotation(next: Notation): Promise<void>;
  isUpdating: boolean;
}

export function useNotation(modelId: string | undefined, layer: Layer): UseNotationApi {
  const [notation, setLocalNotation] = useState<Notation>(DEFAULT_NOTATION);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const { publish, subscribe } = useBroadcastCanvas(modelId);

  // Preserve the last-fetched canvas state so PUTs don't accidentally
  // blank out positions/viewport when the only change is notation.
  const lastRowRef = useRef<CanvasStateRow>({});

  // Load initial value on mount / modelId / layer change.
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<GetCanvasStateResponse>(
          `/model-studio/models/${modelId}/canvas-state?layer=${layer}`,
        );
        if (cancelled) return;
        const row = data?.data ?? {};
        lastRowRef.current = row;
        setLocalNotation(row.notation ?? DEFAULT_NOTATION);
      } catch (err) {
        if (cancelled) return;
        // A failed initial load is non-fatal — we fall back to the IE
        // default. No toast: this is a silent background read and the
        // canvas itself will surface the broader "failed to load" state.
        if (!axios.isAxiosError(err) && !(err instanceof Error)) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId, layer]);

  // Subscribe to peer-tab notation changes (7B).
  useEffect(() => {
    if (!modelId) return;
    const unsubscribe = subscribe('notation', (value) => {
      if (value === 'ie' || value === 'idef1x') {
        setLocalNotation(value);
        lastRowRef.current = { ...lastRowRef.current, notation: value };
      }
    });
    return unsubscribe;
  }, [modelId, subscribe]);

  const setNotation = useCallback(
    async (next: Notation) => {
      if (!modelId) return;
      if (next === notation) return;
      const prev = notation;
      // Optimistic UI first — the flip must feel instant.
      setLocalNotation(next);
      setIsUpdating(true);
      try {
        const row = lastRowRef.current;
        const payload = {
          layer,
          notation: next,
          nodePositions: row.nodePositions ?? {},
          viewport: row.viewport ?? { x: 0, y: 0, zoom: 1 },
        };
        const { data } = await api.put<PutCanvasStateResponse>(
          `/model-studio/models/${modelId}/canvas-state`,
          payload,
        );
        lastRowRef.current = data?.data ?? { ...row, notation: next };
        // Broadcast AFTER the server confirms — peer tabs shouldn't
        // render a value that only existed for 300ms on this tab.
        publish('notation', next);
      } catch (err) {
        // Revert on failure, surface a toast. No zombie notation state.
        setLocalNotation(prev);
        const msg =
          axios.isAxiosError(err) && typeof err.response?.data === 'object'
            ? ((err.response?.data as { error?: string })?.error ?? 'Failed to update notation')
            : err instanceof Error
              ? err.message
              : 'Failed to update notation';
        toast(msg, 'error');
      } finally {
        setIsUpdating(false);
      }
    },
    [modelId, layer, notation, publish, toast],
  );

  return { notation, setNotation, isUpdating };
}
