import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layer } from '@cc/shared';
import { api } from '../lib/api';

/**
 * Per-user, per-model, per-layer canvas state.
 *
 * Design:
 *  - On mount (modelId / layer changes) fetch the server state once.
 *  - Expose `save()` that the caller debounces from React Flow
 *    onNodeDragStop / onViewportChangeEnd handlers (500ms window).
 *  - Save failures are surfaced but never destructive — the client
 *    still holds the latest positions in memory.
 */

export interface CanvasState {
  nodePositions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string | null;
}

const EMPTY: CanvasState = {
  nodePositions: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  updatedAt: null,
};

interface GetResponse {
  data: CanvasState;
}

export function useCanvasState(modelId: string | undefined, layer: Layer) {
  const [state, setState] = useState<CanvasState>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks which layer the current `state` represents. Stays at the
  // PREVIOUS layer's value during a layer-change transition until the
  // new fetch resolves — consumers (the canvas seed effect) gate on
  // `loadedLayer === layer` so they don't seed with stale data from
  // the prior layer.
  const [loadedLayer, setLoadedLayer] = useState<Layer | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await api.get<GetResponse>(
          `/model-studio/models/${modelId}/canvas-state?layer=${layer}`,
        );
        if (!cancelled) {
          setState(data?.data ?? EMPTY);
          setLoadedLayer(layer);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load canvas state');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [modelId, layer]);

  /**
   * Debounced save. Caller fires this on every viewport or node
   * position change; we coalesce writes with a 500ms trailing edge.
   */
  const save = useCallback(
    (next: Pick<CanvasState, 'nodePositions' | 'viewport'>) => {
      setState((prev) => ({ ...prev, ...next }));
      if (!modelId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const { data } = await api.put<GetResponse>(
            `/model-studio/models/${modelId}/canvas-state`,
            {
              layer,
              nodePositions: next.nodePositions,
              viewport: next.viewport,
            },
          );
          setState(data?.data ?? EMPTY);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to save canvas state');
        }
      }, 500);
    },
    [modelId, layer],
  );

  return { state, isLoading, error, save, loadedLayer };
}
