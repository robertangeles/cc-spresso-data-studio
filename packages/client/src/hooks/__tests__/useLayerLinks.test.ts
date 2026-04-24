// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 7 — useLayerLinks hook tests. Covers the happy paths for
 * loadByParent, create, and delete plus the optimistic-rollback
 * behaviour on delete failure. Matches useRelationships.test.ts style:
 * mocked axios-based `api`, ToastProvider wrapper, renderHook + act.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useLayerLinks } from '../useLayerLinks';
import { ToastProvider } from '../../components/ui/Toast';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';
const PARENT_ID = '00000000-0000-4000-8000-0000000000bb';
const CHILD_ID = '00000000-0000-4000-8000-0000000000cc';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children);
}

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: PARENT_ID,
    parentName: 'Customer',
    parentLayer: 'conceptual',
    childId: CHILD_ID,
    childName: 'customer',
    childLayer: 'logical',
    linkType: 'layer_projection',
    createdAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('useLayerLinks', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.delete.mockReset();
  });

  it('loadByParent caches returned rows into `links`', async () => {
    const row = makeLink();
    mocks.get.mockResolvedValueOnce({ data: { data: [row] } });

    const { result } = renderHook(() => useLayerLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.loadByParent(PARENT_ID);
    });

    expect(result.current.links).toEqual([row]);
    expect(mocks.get).toHaveBeenCalledWith(
      `/model-studio/models/${MODEL_ID}/layer-links?parentId=${PARENT_ID}`,
    );
  });

  it('create appends the server-returned row on success', async () => {
    const row = makeLink();
    mocks.post.mockResolvedValueOnce({ data: { data: row } });

    const { result } = renderHook(() => useLayerLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.create(PARENT_ID, CHILD_ID);
    });

    expect(result.current.links).toEqual([row]);
    expect(mocks.post).toHaveBeenCalledWith(`/model-studio/models/${MODEL_ID}/layer-links`, {
      parentId: PARENT_ID,
      childId: CHILD_ID,
    });
  });

  it('delete optimistically removes then rolls back on 500', async () => {
    // Seed a row so we have something to delete.
    const row = makeLink();
    mocks.get.mockResolvedValueOnce({ data: { data: [row] } });
    const error = Object.assign(new Error('boom'), {
      isAxiosError: true,
      response: { status: 500, data: { success: false, error: 'boom' } },
    });
    mocks.delete.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useLayerLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.loadByParent(PARENT_ID);
    });
    expect(result.current.links).toEqual([row]);

    let caught: unknown = null;
    await act(async () => {
      await result.current.delete(row.id).catch((e) => {
        caught = e;
      });
    });

    // Rollback restored the row.
    expect(result.current.links).toEqual([row]);
    expect(caught).toBeTruthy();
  });

  it('delete silently accepts a 404 (peer-tab already deleted it)', async () => {
    const row = makeLink();
    mocks.get.mockResolvedValueOnce({ data: { data: [row] } });
    const notFound = Object.assign(new Error('gone'), {
      isAxiosError: true,
      response: { status: 404, data: { success: false, error: 'Layer link not found' } },
    });
    mocks.delete.mockRejectedValueOnce(notFound);

    const { result } = renderHook(() => useLayerLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.loadByParent(PARENT_ID);
    });

    // Should NOT throw on 404.
    await act(async () => {
      await result.current.delete(row.id);
    });
    // Optimistic removal stands — the row is gone from cache.
    expect(result.current.links).toEqual([]);
  });
});
