// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InferRelationshipsPanel } from '../InferRelationshipsPanel';
import type { InferredProposal } from '../../../hooks/useRelationships';

afterEach(() => cleanup());

/**
 * S6-U25 — accept-one / accept-all / reject flows for the inference panel.
 */

const proposal = (
  srcId: string,
  srcName: string,
  tgtId: string,
  tgtName: string,
): InferredProposal => ({
  sourceEntityId: srcId,
  sourceEntityName: srcName,
  targetEntityId: tgtId,
  targetEntityName: tgtName,
  sourceCardinality: 'one',
  targetCardinality: 'many',
  confidence: 'high',
  reason: 'FK + UQ + NOT NULL',
});

describe('InferRelationshipsPanel (S6-U25)', () => {
  it('renders proposals from a sync inference result', async () => {
    const onInfer = vi.fn().mockResolvedValue({
      async: false,
      proposals: [proposal('a', 'Customer', 'b', 'Order')],
      warnings: [],
    });
    render(
      <InferRelationshipsPanel
        isOpen
        onClose={() => {}}
        layer="logical"
        onInfer={onInfer}
        onCreate={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('infer-proposals-list')).toBeTruthy();
    });
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Order')).toBeTruthy();
  });

  it('accept-one fires onCreate exactly once with the proposal payload', async () => {
    const p1 = proposal('a', 'A', 'b', 'B');
    const p2 = proposal('c', 'C', 'd', 'D');
    const onInfer = vi.fn().mockResolvedValue({
      async: false,
      proposals: [p1, p2],
      warnings: [],
    });
    const onCreate = vi.fn().mockResolvedValue({
      id: 'rel-new',
      sourceEntityId: 'a',
      targetEntityId: 'b',
    });
    render(
      <InferRelationshipsPanel
        isOpen
        onClose={() => {}}
        layer="logical"
        onInfer={onInfer}
        onCreate={onCreate}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('infer-proposals-list')).toBeTruthy();
    });

    // Deselect p2 (p1 is selected by default).
    fireEvent.click(screen.getByTestId('infer-proposal-toggle-c:d'));
    fireEvent.click(screen.getByTestId('infer-submit'));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      sourceEntityId: 'a',
      targetEntityId: 'b',
      layer: 'logical',
      isIdentifying: false,
    });
  });

  it('accept-all + submit creates both', async () => {
    const onInfer = vi.fn().mockResolvedValue({
      async: false,
      proposals: [proposal('a', 'A', 'b', 'B'), proposal('c', 'C', 'd', 'D')],
      warnings: [],
    });
    const onCreate = vi.fn().mockResolvedValue({ id: 'rel-x' });
    render(
      <InferRelationshipsPanel
        isOpen
        onClose={() => {}}
        layer="logical"
        onInfer={onInfer}
        onCreate={onCreate}
      />,
    );
    await waitFor(() => screen.getByTestId('infer-proposals-list'));
    fireEvent.click(screen.getByTestId('infer-accept-all'));
    fireEvent.click(screen.getByTestId('infer-submit'));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(2);
    });
  });

  it('reject-all disables the submit button', async () => {
    const onInfer = vi.fn().mockResolvedValue({
      async: false,
      proposals: [proposal('a', 'A', 'b', 'B')],
      warnings: [],
    });
    const onCreate = vi.fn();
    render(
      <InferRelationshipsPanel
        isOpen
        onClose={() => {}}
        layer="logical"
        onInfer={onInfer}
        onCreate={onCreate}
      />,
    );
    await waitFor(() => screen.getByTestId('infer-proposals-list'));
    fireEvent.click(screen.getByTestId('infer-reject-all'));
    const submit = screen.getByTestId('infer-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('renders warnings from sync response', async () => {
    const onInfer = vi.fn().mockResolvedValue({
      async: false,
      proposals: [],
      warnings: ['Skipped dangling FK: customer_id'],
    });
    render(
      <InferRelationshipsPanel
        isOpen
        onClose={() => {}}
        layer="logical"
        onInfer={onInfer}
        onCreate={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('infer-warnings').textContent).toContain('customer_id');
    });
  });
});
