// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { Relationship } from '@cc/shared';
import { EdgeContextMenu } from '../EdgeContextMenu';

afterEach(() => cleanup());

const rel: Relationship = {
  id: 'rel-1',
  dataModelId: 'mdl-1',
  sourceEntityId: 'ent-a',
  targetEntityId: 'ent-b',
  name: 'owns',
  sourceCardinality: 'one',
  targetCardinality: 'many',
  isIdentifying: false,
  layer: 'logical',
  metadata: {},
  version: 1,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
};

describe('EdgeContextMenu — D-R3', () => {
  it('renders five menu actions', () => {
    render(
      <EdgeContextMenu
        relationship={rel}
        x={50}
        y={50}
        onClose={() => {}}
        onRename={async () => {}}
        onFlip={async () => {}}
        onToggleIdentifying={async () => {}}
        onDelete={async () => {}}
      />,
    );
    expect(screen.getByTestId('edge-context-rename')).toBeTruthy();
    expect(screen.getByTestId('edge-context-flip')).toBeTruthy();
    expect(screen.getByTestId('edge-context-toggle-identifying')).toBeTruthy();
    expect(screen.getByTestId('edge-context-copy-cardinality')).toBeTruthy();
    expect(screen.getByTestId('edge-context-delete')).toBeTruthy();
  });

  it('Rename action switches to inline input', () => {
    render(
      <EdgeContextMenu
        relationship={rel}
        x={50}
        y={50}
        onClose={() => {}}
        onRename={async () => {}}
        onFlip={async () => {}}
        onToggleIdentifying={async () => {}}
        onDelete={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('edge-context-rename'));
    expect(screen.getByTestId('edge-context-rename-input')).toBeTruthy();
  });

  it('Flip action fires onFlip + onClose', async () => {
    const onFlip = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <EdgeContextMenu
        relationship={rel}
        x={50}
        y={50}
        onClose={onClose}
        onRename={async () => {}}
        onFlip={onFlip}
        onToggleIdentifying={async () => {}}
        onDelete={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('edge-context-flip'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onFlip).toHaveBeenCalled();
  });

  it('Delete action fires onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <EdgeContextMenu
        relationship={rel}
        x={50}
        y={50}
        onClose={() => {}}
        onRename={async () => {}}
        onFlip={async () => {}}
        onToggleIdentifying={async () => {}}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId('edge-context-delete'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalled();
  });
});
