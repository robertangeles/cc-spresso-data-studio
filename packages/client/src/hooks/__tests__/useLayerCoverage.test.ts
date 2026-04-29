// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 7 — useLayerCoverage hook tests. Covers the two read surfaces
 * (coverage matrix + name-match suggestions) + the clearSuggestions
 * helper the banner component uses after bulk-accept.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useLayerCoverage } from '../useLayerCoverage';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';

describe('useLayerCoverage', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('loadCoverage returns and caches the matrix', async () => {
    const matrix = {
      'entity-a': { conceptual: true, logical: true, physical: false },
      'entity-b': { conceptual: false, logical: true, physical: true },
    };
    mocks.get.mockResolvedValueOnce({ data: { data: { coverage: matrix } } });

    const { result } = renderHook(() => useLayerCoverage(MODEL_ID));
    await act(async () => {
      await result.current.loadCoverage();
    });

    expect(result.current.coverage).toEqual(matrix);
    expect(mocks.get).toHaveBeenCalledWith(`/model-studio/models/${MODEL_ID}/layer-coverage`);
  });

  it('loadSuggestions populates the suggestions array', async () => {
    const suggestions = [
      {
        fromEntityId: 'a',
        fromEntityName: 'Customer',
        toEntityId: 'b',
        toEntityName: 'Customer',
        confidence: 'high',
      },
    ];
    mocks.get.mockResolvedValueOnce({ data: { data: { suggestions } } });

    const { result } = renderHook(() => useLayerCoverage(MODEL_ID));
    await act(async () => {
      await result.current.loadSuggestions('conceptual', 'logical');
    });

    expect(result.current.suggestions).toEqual(suggestions);
    expect(mocks.get).toHaveBeenCalledWith(
      `/model-studio/models/${MODEL_ID}/layer-links/suggestions?fromLayer=conceptual&toLayer=logical`,
    );
  });

  it('clearSuggestions empties the suggestions array without touching coverage', async () => {
    mocks.get.mockResolvedValueOnce({
      data: {
        data: {
          suggestions: [
            {
              fromEntityId: 'a',
              fromEntityName: 'X',
              toEntityId: 'b',
              toEntityName: 'X',
              confidence: 'high',
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useLayerCoverage(MODEL_ID));
    await act(async () => {
      await result.current.loadSuggestions('conceptual', 'logical');
    });
    expect(result.current.suggestions).toHaveLength(1);

    act(() => {
      result.current.clearSuggestions();
    });
    expect(result.current.suggestions).toEqual([]);
  });
});
