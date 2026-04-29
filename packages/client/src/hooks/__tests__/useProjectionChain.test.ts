// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 7 — useProjectionChain hook tests. Covers load + cache +
 * invalidate behaviour. Pure read path; no mutations to assert against.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useProjectionChain } from '../useProjectionChain';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';
const ENTITY_ID = '00000000-0000-4000-8000-0000000000bb';

function makeChain() {
  return {
    rootId: ENTITY_ID,
    nodes: [
      {
        entityId: ENTITY_ID,
        entityName: 'Customer',
        layer: 'conceptual',
        parentIds: [],
        childIds: ['c1'],
      },
      {
        entityId: 'c1',
        entityName: 'customer',
        layer: 'logical',
        parentIds: [ENTITY_ID],
        childIds: [],
      },
    ],
  };
}

describe('useProjectionChain', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('loadChain populates the cache keyed by entity id', async () => {
    const chain = makeChain();
    mocks.get.mockResolvedValueOnce({ data: { data: chain } });

    const { result } = renderHook(() => useProjectionChain(MODEL_ID));
    await act(async () => {
      await result.current.loadChain(ENTITY_ID);
    });

    expect(result.current.chains[ENTITY_ID]).toEqual(chain);
  });

  it('invalidate drops a single entity from cache', async () => {
    const chain = makeChain();
    mocks.get.mockResolvedValueOnce({ data: { data: chain } });

    const { result } = renderHook(() => useProjectionChain(MODEL_ID));
    await act(async () => {
      await result.current.loadChain(ENTITY_ID);
    });
    expect(result.current.chains[ENTITY_ID]).toBeDefined();

    act(() => {
      result.current.invalidate(ENTITY_ID);
    });
    expect(result.current.chains[ENTITY_ID]).toBeUndefined();
  });

  it('invalidateAll drops every cached chain', async () => {
    const chain = makeChain();
    mocks.get.mockResolvedValue({ data: { data: chain } });

    const { result } = renderHook(() => useProjectionChain(MODEL_ID));
    await act(async () => {
      await result.current.loadChain(ENTITY_ID);
      await result.current.loadChain('another-entity');
    });
    expect(Object.keys(result.current.chains).length).toBeGreaterThan(0);

    act(() => {
      result.current.invalidateAll();
    });
    expect(result.current.chains).toEqual({});
  });
});
