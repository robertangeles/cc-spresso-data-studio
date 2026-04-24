// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { TidyButton, runDagreLayout } from '../TidyButton';

const nodes: Node[] = [
  { id: 'a', type: 'entity', position: { x: 0, y: 0 }, data: {}, width: 200, height: 100 },
  { id: 'b', type: 'entity', position: { x: 0, y: 0 }, data: {}, width: 200, height: 100 },
  { id: 'c', type: 'entity', position: { x: 0, y: 0 }, data: {}, width: 200, height: 100 },
];
const edges: Edge[] = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c' },
];

describe('runDagreLayout', () => {
  it('assigns non-overlapping positions to three chained nodes', () => {
    const laid = runDagreLayout(nodes, edges);
    expect(laid).toHaveLength(3);
    const xs = laid.map((n) => n.position.x);
    const distinct = new Set(xs);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('tolerates a self-ref edge without throwing', () => {
    const self = [...edges, { id: 'e3', source: 'a', target: 'a' } as Edge];
    expect(() => runDagreLayout(nodes, self)).not.toThrow();
  });
});

describe('TidyButton', () => {
  it('fires onLayout with dagre-computed positions on click', () => {
    const onLayout = vi.fn();
    render(<TidyButton nodes={nodes} edges={edges} onLayout={onLayout} />);
    fireEvent.click(screen.getByTestId('tidy-button'));
    expect(onLayout).toHaveBeenCalledTimes(1);
    const next = onLayout.mock.calls[0][0] as Node[];
    expect(next).toHaveLength(3);
  });

  it('⌘Shift+T triggers layout', () => {
    const onLayout = vi.fn();
    render(<TidyButton nodes={nodes} edges={edges} onLayout={onLayout} />);
    fireEvent.keyDown(window, { key: 'T', shiftKey: true, metaKey: true });
    expect(onLayout).toHaveBeenCalled();
  });
});
