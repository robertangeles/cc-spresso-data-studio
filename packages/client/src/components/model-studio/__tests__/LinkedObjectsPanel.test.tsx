// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { ProjectionChainResponse } from '@cc/shared';
import { LinkedObjectsPanel } from '../LinkedObjectsPanel';

afterEach(() => cleanup());

const ROOT = 'root-id';
const PARENT = 'parent-id';
const CHILD = 'child-id';

function makeChain(): ProjectionChainResponse {
  return {
    rootId: ROOT,
    nodes: [
      {
        entityId: PARENT,
        entityName: 'Customer',
        layer: 'conceptual',
        parentIds: [],
        childIds: [ROOT],
      },
      {
        entityId: ROOT,
        entityName: 'customer',
        layer: 'logical',
        parentIds: [PARENT],
        childIds: [CHILD],
      },
      {
        entityId: CHILD,
        entityName: 'dim_customer',
        layer: 'physical',
        parentIds: [ROOT],
        childIds: [],
      },
    ],
  };
}

describe('LinkedObjectsPanel', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <LinkedObjectsPanel
        isOpen={false}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders empty-state when chain is null', () => {
    render(
      <LinkedObjectsPanel isOpen={true} chain={null} onClose={() => {}} onJumpTo={() => {}} />,
    );
    expect(screen.getByTestId('linked-objects-empty')).toBeTruthy();
  });

  it('renders empty-state when chain has only the root (singleton)', () => {
    render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={{
          rootId: ROOT,
          nodes: [
            {
              entityId: ROOT,
              entityName: 'customer',
              layer: 'logical',
              parentIds: [],
              childIds: [],
            },
          ],
        }}
        onClose={() => {}}
        onJumpTo={() => {}}
      />,
    );
    expect(screen.getByTestId('linked-objects-empty')).toBeTruthy();
  });

  it('renders one row per chain node, grouped by layer with the current entity flagged', () => {
    render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={() => {}}
      />,
    );
    expect(screen.getByTestId(`linked-object-row-${PARENT}`)).toBeTruthy();
    expect(screen.getByTestId(`linked-object-row-${ROOT}`)).toBeTruthy();
    expect(screen.getByTestId(`linked-object-row-${CHILD}`)).toBeTruthy();
    expect(screen.getByTestId(`linked-object-row-${ROOT}`).getAttribute('data-current')).toBe(
      'true',
    );
  });

  it('fires onJumpTo(entityId, layer) when a non-current row is clicked', () => {
    const onJumpTo = vi.fn();
    render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={onJumpTo}
      />,
    );
    fireEvent.click(screen.getByTestId(`linked-object-row-${PARENT}`));
    expect(onJumpTo).toHaveBeenCalledWith(PARENT, 'conceptual');
  });

  it('does NOT fire onJumpTo when the current row is clicked (button is disabled)', () => {
    const onJumpTo = vi.fn();
    render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={onJumpTo}
      />,
    );
    fireEvent.click(screen.getByTestId(`linked-object-row-${ROOT}`));
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('renders the Link-existing footer button only when onLinkExisting is provided', () => {
    const { rerender } = render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={() => {}}
      />,
    );
    expect(screen.queryByTestId('linked-objects-link-existing')).toBeNull();

    const onLinkExisting = vi.fn();
    rerender(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={() => {}}
        onJumpTo={() => {}}
        onLinkExisting={onLinkExisting}
      />,
    );
    fireEvent.click(screen.getByTestId('linked-objects-link-existing'));
    expect(onLinkExisting).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <LinkedObjectsPanel
        isOpen={true}
        chain={makeChain()}
        onClose={onClose}
        onJumpTo={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('linked-objects-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
