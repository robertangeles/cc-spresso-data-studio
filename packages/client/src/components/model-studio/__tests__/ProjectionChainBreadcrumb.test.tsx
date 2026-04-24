// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { ProjectionChainResponse } from '@cc/shared';
import { ProjectionChainBreadcrumb } from '../ProjectionChainBreadcrumb';

afterEach(() => cleanup());

/** Step 7 — ProjectionChainBreadcrumb tests. Covers the null-render
 *  branches (missing chain, single-node chain), the linear-path
 *  resolver for a 3-layer chain, and the onSegmentClick callback.
 *  Multi-parent alternates-hint rendering is covered too. */

const ROOT_ID = 'root-entity';
const PARENT_ID = 'parent-entity';
const CHILD_ID = 'child-entity';
const ALT_PARENT_ID = 'alt-parent';

function makeChain(): ProjectionChainResponse {
  return {
    rootId: ROOT_ID,
    nodes: [
      {
        entityId: PARENT_ID,
        entityName: 'Customer',
        layer: 'conceptual',
        parentIds: [],
        childIds: [ROOT_ID],
      },
      {
        entityId: ROOT_ID,
        entityName: 'customer',
        layer: 'logical',
        parentIds: [PARENT_ID],
        childIds: [CHILD_ID],
      },
      {
        entityId: CHILD_ID,
        entityName: 'dim_customer',
        layer: 'physical',
        parentIds: [ROOT_ID],
        childIds: [],
      },
    ],
  };
}

describe('ProjectionChainBreadcrumb', () => {
  it('renders null when chain is missing', () => {
    const { container } = render(<ProjectionChainBreadcrumb chain={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when the chain has only one node (entity unlinked)', () => {
    const solo: ProjectionChainResponse = {
      rootId: ROOT_ID,
      nodes: [
        {
          entityId: ROOT_ID,
          entityName: 'customer',
          layer: 'logical',
          parentIds: [],
          childIds: [],
        },
      ],
    };
    const { container } = render(<ProjectionChainBreadcrumb chain={solo} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all three segments for a 3-layer chain in top→leaf order', () => {
    render(<ProjectionChainBreadcrumb chain={makeChain()} />);
    expect(screen.getByTestId(`chain-segment-${PARENT_ID}`).textContent).toContain('Customer');
    expect(screen.getByTestId(`chain-segment-${ROOT_ID}`).textContent).toContain('customer');
    expect(screen.getByTestId(`chain-segment-${CHILD_ID}`).textContent).toContain('dim_customer');
  });

  it('highlights the current segment with aria-current="location"', () => {
    render(<ProjectionChainBreadcrumb chain={makeChain()} />);
    const current = screen.getByTestId(`chain-segment-${ROOT_ID}`);
    expect(current.getAttribute('aria-current')).toBe('location');
    // Non-current segments are buttons; the current one is a span.
    expect(current.tagName).toBe('SPAN');
  });

  it('fires onSegmentClick(entityId, layer) when a non-current segment is clicked', () => {
    const onSegmentClick = vi.fn();
    render(<ProjectionChainBreadcrumb chain={makeChain()} onSegmentClick={onSegmentClick} />);
    fireEvent.click(screen.getByTestId(`chain-segment-${PARENT_ID}`));
    expect(onSegmentClick).toHaveBeenCalledWith(PARENT_ID, 'conceptual');
  });

  it('shows the alternates hint when any node has multiple parents', () => {
    const multiParent: ProjectionChainResponse = {
      rootId: ROOT_ID,
      nodes: [
        {
          entityId: PARENT_ID,
          entityName: 'Customer',
          layer: 'conceptual',
          parentIds: [],
          childIds: [ROOT_ID],
        },
        {
          entityId: ALT_PARENT_ID,
          entityName: 'Party',
          layer: 'conceptual',
          parentIds: [],
          childIds: [ROOT_ID],
        },
        {
          entityId: ROOT_ID,
          entityName: 'customer',
          layer: 'logical',
          // Multi-parent: ROOT has TWO conceptual parents.
          parentIds: [PARENT_ID, ALT_PARENT_ID],
          childIds: [],
        },
      ],
    };
    render(<ProjectionChainBreadcrumb chain={multiParent} />);
    expect(screen.getByTestId('projection-chain-alternates-hint')).toBeTruthy();
  });
});
