// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 7 — useProjection hook tests. Covers the scaffold happy path
 * and the 409 "already projected" error shape callers use to render
 * the "Jump to it?" CTA.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useProjection } from '../useProjection';
import { ToastProvider } from '../../components/ui/Toast';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';
const SOURCE_ID = '00000000-0000-4000-8000-0000000000bb';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children);
}

describe('useProjection', () => {
  beforeEach(() => {
    mocks.post.mockReset();
  });

  it('project returns the scaffold payload on 201', async () => {
    const payload = {
      entity: { id: 'new-logical' },
      layerLink: { id: 'link-id' },
      attributeLinks: [{ id: 'attr-link-1' }],
    };
    mocks.post.mockResolvedValueOnce({ data: { data: payload } });

    const { result } = renderHook(() => useProjection(MODEL_ID), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.project(SOURCE_ID, 'logical');
    });

    expect(out).toEqual(payload);
    expect(mocks.post).toHaveBeenCalledWith(
      `/model-studio/models/${MODEL_ID}/entities/${SOURCE_ID}/project`,
      { toLayer: 'logical' },
    );
  });

  it('project throws + `isAlreadyProjectedError` returns true on 409', async () => {
    const conflict = Object.assign(new Error('Already projected'), {
      isAxiosError: true,
      response: {
        status: 409,
        data: { success: false, error: 'Already projected on logical layer' },
      },
    });
    mocks.post.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useProjection(MODEL_ID), { wrapper });
    let caught: unknown = null;
    await act(async () => {
      await result.current.project(SOURCE_ID, 'logical').catch((e) => {
        caught = e;
      });
    });

    expect(caught).toBeTruthy();
    expect(result.current.isAlreadyProjectedError(conflict)).toBe(true);
  });

  it('forwards nameOverride when supplied', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        data: { entity: {}, layerLink: {}, attributeLinks: [] },
      },
    });

    const { result } = renderHook(() => useProjection(MODEL_ID), { wrapper });
    await act(async () => {
      await result.current.project(SOURCE_ID, 'physical', 'dim_customer');
    });

    expect(mocks.post).toHaveBeenCalledWith(
      `/model-studio/models/${MODEL_ID}/entities/${SOURCE_ID}/project`,
      { toLayer: 'physical', nameOverride: 'dim_customer' },
    );
  });
});
