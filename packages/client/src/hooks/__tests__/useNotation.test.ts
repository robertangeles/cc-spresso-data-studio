// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * S6-U21 — `useNotation` BroadcastChannel sync across simulated tabs.
 *
 * Two hook instances are rendered in the same test process. We flip
 * notation on tab A (PUT succeeds, then broadcast fires) and assert
 * tab B sees the new value without issuing its own PUT.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: mocks }));

import { useNotation } from '../useNotation';
import { ToastProvider } from '../../components/ui/Toast';

// Minimal shared-registry BroadcastChannel polyfill (same as
// useBroadcastCanvas.test.ts) — duplicated here rather than imported
// because vitest resets modules between test files. Keeping it local
// avoids cross-file coupling.
type Listener = (ev: { data: unknown }) => void;
class FakeBroadcastChannel {
  private static registry = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<Listener>();
  constructor(public name: string) {
    const set = FakeBroadcastChannel.registry.get(name) ?? new Set();
    set.add(this);
    FakeBroadcastChannel.registry.set(name, set);
  }
  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.registry.get(this.name);
    if (!peers) return;
    for (const p of peers) if (p !== this) for (const l of p.listeners) l({ data });
  }
  addEventListener(_t: 'message', l: Listener) {
    this.listeners.add(l);
  }
  removeEventListener(_t: 'message', l: Listener) {
    this.listeners.delete(l);
  }
  close() {
    const peers = FakeBroadcastChannel.registry.get(this.name);
    peers?.delete(this);
    this.listeners.clear();
  }
  static reset() {
    FakeBroadcastChannel.registry.clear();
  }
}

const originalBC = globalThis.BroadcastChannel;

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  FakeBroadcastChannel.reset();
  (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
});

afterEach(() => {
  if (originalBC) {
    (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
      originalBC;
  } else {
    // @ts-expect-error — teardown
    delete globalThis.BroadcastChannel;
  }
});

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children);
}

describe('useNotation — S6-U21 two-tab BroadcastChannel sync', () => {
  it('flipping notation in tab A propagates to tab B without a second PUT', async () => {
    // Both initial GETs return notation=ie + an existing layout.
    mocks.get.mockResolvedValue({
      data: {
        data: {
          notation: 'ie',
          nodePositions: { a: { x: 10, y: 20 } },
          viewport: { x: 5, y: 5, zoom: 1.5 },
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
      },
    });
    // Tab A's PUT will return the updated row.
    mocks.put.mockResolvedValueOnce({
      data: {
        data: {
          notation: 'idef1x',
          nodePositions: { a: { x: 10, y: 20 } },
          viewport: { x: 5, y: 5, zoom: 1.5 },
          updatedAt: '2026-04-20T00:00:01.000Z',
        },
      },
    });

    const tabA = renderHook(() => useNotation(MODEL_ID, 'logical'), { wrapper });
    const tabB = renderHook(() => useNotation(MODEL_ID, 'logical'), { wrapper });

    // Let both initial GETs resolve.
    await waitFor(() => expect(tabA.result.current.notation).toBe('ie'));
    await waitFor(() => expect(tabB.result.current.notation).toBe('ie'));

    await act(async () => {
      await tabA.result.current.setNotation('idef1x');
    });

    // Tab A reflects the flip immediately.
    expect(tabA.result.current.notation).toBe('idef1x');

    // Tab B observed the broadcast. Give React one flush.
    await waitFor(() => expect(tabB.result.current.notation).toBe('idef1x'));

    // Critically, only tab A issued a PUT.
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });

  it('reverts optimistic notation when the PUT fails', async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: {
          notation: 'ie',
          nodePositions: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          updatedAt: null,
        },
      },
    });
    mocks.put.mockRejectedValueOnce(
      Object.assign(new Error('boom'), {
        isAxiosError: true,
        response: { status: 500, data: { success: false, error: 'server busted' } },
      }),
    );

    const tabA = renderHook(() => useNotation(MODEL_ID, 'logical'), { wrapper });
    await waitFor(() => expect(tabA.result.current.notation).toBe('ie'));

    await act(async () => {
      await tabA.result.current.setNotation('idef1x');
    });

    // Reverted after the rejection.
    expect(tabA.result.current.notation).toBe('ie');
  });
});
