// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Relationship } from '@cc/shared';
import { CascadeDeleteDialog } from '../CascadeDeleteDialog';
import type { EntitySummary } from '../../../hooks/useEntities';

afterEach(() => cleanup());

const entity = (id: string, name: string): EntitySummary => ({
  id,
  dataModelId: 'm1',
  name,
  businessName: null,
  description: null,
  layer: 'logical',
  entityType: 'standard',
  displayId: null,
  metadata: {},
  tags: [],
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
  lint: [],
});

const rel = (id: string, src: string, tgt: string): Relationship => ({
  id,
  dataModelId: 'm1',
  sourceEntityId: src,
  targetEntityId: tgt,
  name: null,
  sourceCardinality: 'one',
  targetCardinality: 'many',
  isIdentifying: false,
  layer: 'logical',
  metadata: {},
  version: 1,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
});

describe('CascadeDeleteDialog (S6-U23)', () => {
  it('shows correct impacted count and row list', async () => {
    const entities = [entity('a', 'Customer'), entity('b', 'Order'), entity('c', 'Payment')];
    const relationships = [rel('r1', 'a', 'b'), rel('r2', 'a', 'c')];

    const getEntityImpact = vi.fn().mockResolvedValue({
      relationshipIds: ['r1', 'r2'],
      count: 2,
    });

    render(
      <CascadeDeleteDialog
        isOpen
        entityId="a"
        entityName="Customer"
        getEntityImpact={getEntityImpact}
        relationships={relationships}
        entities={entities}
        onConfirm={async () => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cascade-delete-count').textContent).toContain('2');
    });

    const list = screen.getByTestId('cascade-delete-list');
    expect(list.textContent).toContain('Customer → Order');
    expect(list.textContent).toContain('Customer → Payment');
  });

  it('shows delta message when count changed on confirm', async () => {
    const entities = [entity('a', 'A'), entity('b', 'B'), entity('c', 'C')];
    const relationships = [rel('r1', 'a', 'b'), rel('r2', 'a', 'c')];

    const getEntityImpact = vi
      .fn()
      .mockResolvedValueOnce({ relationshipIds: ['r1'], count: 1 }) // initial
      .mockResolvedValueOnce({ relationshipIds: ['r1', 'r2'], count: 2 }); // on confirm

    const onConfirm = vi.fn();

    render(
      <CascadeDeleteDialog
        isOpen
        entityId="a"
        entityName="A"
        getEntityImpact={getEntityImpact}
        relationships={relationships}
        entities={entities}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cascade-delete-count').textContent).toContain('1');
    });

    fireEvent.click(screen.getByTestId('cascade-delete-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('cascade-delete-delta')).toBeTruthy();
    });

    // onConfirm should NOT have been called — delta blocked it.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onConfirm when count is stable', async () => {
    const entities = [entity('a', 'A'), entity('b', 'B')];
    const relationships = [rel('r1', 'a', 'b')];

    const getEntityImpact = vi.fn().mockResolvedValue({ relationshipIds: ['r1'], count: 1 });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <CascadeDeleteDialog
        isOpen
        entityId="a"
        entityName="A"
        getEntityImpact={getEntityImpact}
        relationships={relationships}
        entities={entities}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cascade-delete-count').textContent).toContain('1');
    });

    fireEvent.click(screen.getByTestId('cascade-delete-confirm'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <CascadeDeleteDialog
        isOpen={false}
        entityId="a"
        entityName="A"
        getEntityImpact={vi.fn()}
        relationships={[]}
        entities={[]}
        onConfirm={async () => {}}
        onClose={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="cascade-delete-dialog"]')).toBeNull();
  });
});
