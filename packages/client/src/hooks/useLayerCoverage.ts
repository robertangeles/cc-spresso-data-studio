import { useCallback, useState } from 'react';
import type {
  Layer,
  LayerCoverageResponse,
  LayerLinkSuggestion,
  LayerLinkSuggestionsResponse,
} from '@cc/shared';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-errors';

/**
 * Step 7 — layer overview hook (coverage matrix + name-match suggestions).
 *
 * Two read-only surfaces in one hook because both hit the
 * `/models/:id/*` overview endpoints and both get consumed by the
 * same family of canvas decorations (coverage badges, overlay sort,
 * unlinked glow, suggestions banner). Keeping them together avoids
 * splitting state the callers almost always need in tandem.
 *
 * Caller pattern: load coverage once on model open; reload after any
 * layer-link mutation (create / delete / auto-project). Suggestions
 * are an explicit user action ("scan for unlinked pairs") — loaded
 * on demand, not automatically.
 */

interface CoverageResp {
  data: LayerCoverageResponse;
}

interface SuggestionsResp {
  data: LayerLinkSuggestionsResponse;
}

export interface UseLayerCoverageApi {
  /** Matrix of `{[entityId]: {conceptual, logical, physical}}` or
   *  empty map when never loaded. */
  coverage: LayerCoverageResponse['coverage'];
  suggestions: LayerLinkSuggestion[];
  isLoading: boolean;
  error: string | null;
  loadCoverage(): Promise<LayerCoverageResponse['coverage']>;
  loadSuggestions(fromLayer: Layer, toLayer: Layer): Promise<LayerLinkSuggestion[]>;
  /** Drop the suggestion list (e.g. after bulk-accept). Coverage is
   *  left alone — it's the source of truth for the canvas. */
  clearSuggestions(): void;
}

export function useLayerCoverage(modelId: string | undefined): UseLayerCoverageApi {
  const [coverage, setCoverage] = useState<LayerCoverageResponse['coverage']>({});
  const [suggestions, setSuggestions] = useState<LayerLinkSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCoverage = useCallback(async () => {
    if (!modelId) return {};
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<CoverageResp>(
        `/model-studio/models/${modelId}/layer-coverage`,
      );
      const matrix = data.data?.coverage ?? {};
      setCoverage(matrix);
      return matrix;
    } catch (err) {
      setError(errorMessage(err, 'Failed to load layer coverage'));
      return {};
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

  const loadSuggestions = useCallback(
    async (fromLayer: Layer, toLayer: Layer): Promise<LayerLinkSuggestion[]> => {
      if (!modelId) return [];
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<SuggestionsResp>(
          `/model-studio/models/${modelId}/layer-links/suggestions?fromLayer=${fromLayer}&toLayer=${toLayer}`,
        );
        const rows = data.data?.suggestions ?? [];
        setSuggestions(rows);
        return rows;
      } catch (err) {
        setError(errorMessage(err, 'Failed to load link suggestions'));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [modelId],
  );

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return {
    coverage,
    suggestions,
    isLoading,
    error,
    loadCoverage,
    loadSuggestions,
    clearSuggestions,
  };
}
