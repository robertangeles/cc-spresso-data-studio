// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Relationship } from '@cc/shared';
import { RelationshipPanel } from '../RelationshipPanel';
import { ToastProvider } from '../../ui/Toast';
import type { EntitySummary } from '../../../hooks/useEntities';

afterEach(() => cleanup());

/**
 * Smoke test for RelationshipPanel. Full flow coverage lives in the
 * E2E tier — here we just assert the panel mounts, surfaces tabs, and
 * renders the src/tgt pair in the header.
 */

const rel: Relationship = {
  id: 'rel-1',
  dataModelId: 'mdl-1',
  sourceEntityId: 'ent-a',
  targetEntityId: 'ent-b',
  name: 'owns',
  sourceCardinality: 'one',
  targetCardinality: 'many',
  isIdentifying: true,
  layer: 'logical',
  metadata: {},
  version: 3,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
};

const entities: EntitySummary[] = [
  {
    id: 'ent-a',
    dataModelId: 'mdl-1',
    name: 'Customer',
    businessName: null,
    description: null,
    layer: 'logical',
    entityType: 'standard',
    metadata: {},
    tags: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    lint: [],
  },
  {
    id: 'ent-b',
    dataModelId: 'mdl-1',
    name: 'Order',
    businessName: null,
    description: null,
    layer: 'logical',
    entityType: 'standard',
    metadata: {},
    tags: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    lint: [],
  },
];

describe('RelationshipPanel — smoke', () => {
  it('renders header with src→tgt and all 6 tabs', () => {
    const onUpdate = vi.fn();
    render(
      <ToastProvider>
        <RelationshipPanel
          relationship={rel}
          entities={entities}
          auditEvents={[]}
          auditLoading={false}
          onClose={() => {}}
          onUpdate={onUpdate}
          onDelete={async () => {}}
          onConflict={() => {}}
        />
      </ToastProvider>,
    );
    expect(screen.getByTestId('relationship-panel')).toBeTruthy();
    // Entity names render in the header AND in the General tab's readonly
    // src/tgt rows — assert at least one of each.
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Order').length).toBeGreaterThan(0);
    for (const id of ['general', 'cardinality', 'governance', 'audit', 'rules', 'appearance']) {
      expect(screen.getByTestId(`rel-tab-${id}`)).toBeTruthy();
    }
  });

  it('returns null when no relationship is selected', () => {
    const { container } = render(
      <ToastProvider>
        <RelationshipPanel
          relationship={null}
          entities={entities}
          auditEvents={[]}
          auditLoading={false}
          onClose={() => {}}
          onUpdate={vi.fn()}
          onDelete={async () => {}}
          onConflict={() => {}}
        />
      </ToastProvider>,
    );
    expect(container.querySelector('[data-testid="relationship-panel"]')).toBeNull();
  });
});
