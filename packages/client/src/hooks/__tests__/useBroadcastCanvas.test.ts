// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Smoke tests for `useBroadcastCanvas`:
 *   - publish/subscribe round-trips across two hook instances.
 *   - Own messages are deduped (a publisher never receives its own echo).
 *   - Gracefully no-ops when `BroadcastChannel` is unavailable.
 */

import { useBroadcastCanvas } from '../useBroadcastCanvas';

// ----------------------------------------------------------
// Minimal in-memory BroadcastChannel polyfill. Shared across all
// instances for a given name so two hook instances in the same test
// process can see each other's messages — matching real browser
// behaviour where one channel name bridges documents in the same origin.
// ----------------------------------------------------------
type Listener = (ev: { data: unknown }) => void;

class FakeBroadcastChannel {
  private static registry = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<Listener>();
  constructor(public name: string) {
    const existing = FakeBroadcastChannel.registry.get(name);
    if (existing) existing.add(this);
    else FakeBroadcastChannel.registry.set(name, new Set([this]));
  }
  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.registry.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this) continue; // Don't echo to self — matches the spec.
      for (const l of peer.listeners) l({ data });
    }
  }
  addEventListener(_type: 'message', listener: Listener) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: Listener) {
    this.listeners.delete(listener);
  }
  close() {
    const peers = FakeBroadcastChannel.registry.get(this.name);
    if (peers) {
      peers.delete(this);
      if (peers.size === 0) FakeBroadcastChannel.registry.delete(this.name);
    }
    this.listeners.clear();
  }
  static reset() {
    FakeBroadcastChannel.registry.clear();
  }
}

const originalBC = globalThis.BroadcastChannel;

beforeEach(() => {
  (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
  FakeBroadcastChannel.reset();
});

afterEach(() => {
  if (originalBC) {
    (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
      originalBC;
  } else {
    // @ts-expect-error — intentional teardown
    delete globalThis.BroadcastChannel;
  }
});

describe('useBroadcastCanvas', () => {
  const MODEL_ID = 'model-abc';

  it('publish in instance A invokes subscribers in instance B', async () => {
    const a = renderHook(() => useBroadcastCanvas(MODEL_ID));
    const b = renderHook(() => useBroadcastCanvas(MODEL_ID));

    const handler = vi.fn();
    act(() => {
      b.result.current.subscribe('notation', handler);
    });

    act(() => {
      a.result.current.publish('notation', 'idef1x');
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('idef1x');
  });

  it('dedupes own messages — publisher does not receive own echo', async () => {
    const a = renderHook(() => useBroadcastCanvas(MODEL_ID));
    const handler = vi.fn();
    act(() => {
      a.result.current.subscribe('notation', handler);
    });

    act(() => {
      a.result.current.publish('notation', 'idef1x');
    });

    // No second tab → no peers → handler must not fire.
    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe that detaches the handler', async () => {
    const a = renderHook(() => useBroadcastCanvas(MODEL_ID));
    const b = renderHook(() => useBroadcastCanvas(MODEL_ID));

    const handler = vi.fn();
    let unsub: () => void = () => {};
    act(() => {
      unsub = b.result.current.subscribe('notation', handler);
    });

    act(() => {
      a.result.current.publish('notation', 'ie');
    });
    expect(handler).toHaveBeenCalledTimes(1);

    act(() => {
      unsub();
    });
    act(() => {
      a.result.current.publish('notation', 'idef1x');
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('no-ops when BroadcastChannel is unavailable', async () => {
    // Strip BroadcastChannel for this test.
    // @ts-expect-error — intentional runtime removal
    delete globalThis.BroadcastChannel;

    const { result } = renderHook(() => useBroadcastCanvas(MODEL_ID));
    const handler = vi.fn();
    act(() => {
      result.current.subscribe('notation', handler);
      result.current.publish('notation', 'ie');
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
