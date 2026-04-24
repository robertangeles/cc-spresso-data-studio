// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 7 — useAttributeLinks hook tests. Mirror of the useLayerLinks
 * test suite but for the attribute-grain hook. Same pattern; tests
 * rely on the shared axios mock.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useAttributeLinks } from '../useAttributeLinks';
import { ToastProvider } from '../../components/ui/Toast';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';
const PARENT_ATTR = '00000000-0000-4000-8000-0000000000bb';
const CHILD_ATTR = '00000000-0000-4000-8000-0000000000cc';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children);
}

function makeLink() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    parentId: PARENT_ATTR,
    parentName: 'customer_cd',
    parentEntityId: 'aaaa-aaaa',
    parentLayer: 'conceptual',
    childId: CHILD_ATTR,
    childName: 'customer_cd',
    childEntityId: 'bbbb-bbbb',
    childLayer: 'logical',
    linkType: 'layer_projection',
    createdAt: '2026-04-24T00:00:00.000Z',
  };
}

describe('useAttributeLinks', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.delete.mockReset();
  });

  it('loadByParent loads rows for the given parent attribute', async () => {
    const row = makeLink();
    mocks.get.mockResolvedValueOnce({ data: { data: [row] } });

    const { result } = renderHook(() => useAttributeLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.loadByParent(PARENT_ATTR);
    });
    expect(result.current.links).toEqual([row]);
  });

  it('create rolls through and appends on success', async () => {
    const row = makeLink();
    mocks.post.mockResolvedValueOnce({ data: { data: row } });

    const { result } = renderHook(() => useAttributeLinks(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.create(PARENT_ATTR, CHILD_ATTR);
    });
    expect(result.current.links).toHaveLength(1);
    expect(result.current.links[0]!.id).toBe(row.id);
  });
});
