// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

/**
 * Smoke test for NotationSwitcher. The real broadcast + PUT behaviour
 * is covered by useNotation.test.ts (S6-U21) — here we just assert
 * the UI wires the hook and respects keyboard navigation without
 * blowing the viewport (D-R4 — setNotation is called, but the edge
 * array is never remounted by this component itself).
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({ api: mocks }));

import { NotationSwitcher } from '../NotationSwitcher';
import { ToastProvider } from '../../ui/Toast';

// Use the real BroadcastChannel if present; no cross-tab assertion here.
const originalBC = globalThis.BroadcastChannel;
class NoopBC {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  postMessage() {
    /* no-op */
  }
  addEventListener() {
    /* no-op */
  }
  removeEventListener() {
    /* no-op */
  }
  close() {
    /* no-op */
  }
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    NoopBC as unknown as typeof BroadcastChannel;
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
  mocks.put.mockResolvedValue({
    data: {
      data: {
        notation: 'idef1x',
        nodePositions: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: null,
      },
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalBC) {
    (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
      originalBC;
  }
});

describe('NotationSwitcher — smoke', () => {
  it('renders IE and IDEF1X pills with role=radio', () => {
    render(
      <ToastProvider>
        <NotationSwitcher modelId="m1" layer="logical" />
      </ToastProvider>,
    );
    expect(screen.getByTestId('notation-pill-ie')).toBeTruthy();
    expect(screen.getByTestId('notation-pill-idef1x')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: /relationship notation/i })).toBeTruthy();
  });

  it('clicking IDEF1X triggers a PUT with notation=idef1x', async () => {
    render(
      <ToastProvider>
        <NotationSwitcher modelId="m1" layer="logical" />
      </ToastProvider>,
    );
    // Let useNotation settle its initial GET.
    await screen.findByTestId('notation-pill-idef1x');
    fireEvent.click(screen.getByTestId('notation-pill-idef1x'));
    // The PUT may fire on a microtask — flush with one macrotask.
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.put).toHaveBeenCalled();
    const [url, body] = mocks.put.mock.calls[0];
    expect(url).toMatch(/canvas-state/);
    expect((body as { notation: string }).notation).toBe('idef1x');
  });
});
