// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteModelDialog } from '../DeleteModelDialog';
import type { DataModelSummary } from '../../../hooks/useModels';

afterEach(() => cleanup());

const makeModel = (overrides: Partial<DataModelSummary> = {}): DataModelSummary => ({
  id: 'm1',
  projectId: 'p1',
  ownerId: 'u1',
  name: 'Customer Domain',
  description: null,
  activeLayer: 'logical',
  notation: 'ie',
  originDirection: 'greenfield',
  metadata: {},
  tags: [],
  lastExportedAt: null,
  archivedAt: null,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
  projectName: 'Project',
  organisationId: null,
  organisationName: null,
  clientId: null,
  clientName: null,
  ownerName: 'Rob',
  ...overrides,
});

describe('DeleteModelDialog', () => {
  it('disables the Delete button when the confirm input is empty', () => {
    render(<DeleteModelDialog model={makeModel()} onClose={() => {}} onDelete={async () => {}} />);
    const confirmBtn = screen.getByTestId('delete-model-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('stays disabled when the confirm input is lowercase ("delete")', () => {
    render(<DeleteModelDialog model={makeModel()} onClose={() => {}} onDelete={async () => {}} />);
    const input = screen.getByTestId('delete-model-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'delete' } });

    const confirmBtn = screen.getByTestId('delete-model-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('stays disabled when the confirm input has a trailing space ("DELETE ")', () => {
    render(<DeleteModelDialog model={makeModel()} onClose={() => {}} onDelete={async () => {}} />);
    const input = screen.getByTestId('delete-model-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DELETE ' } });

    const confirmBtn = screen.getByTestId('delete-model-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('enables the Delete button for exact "DELETE" and fires onDelete when clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <DeleteModelDialog
        model={makeModel({ id: 'target-id' })}
        onClose={() => {}}
        onDelete={onDelete}
      />,
    );
    const input = screen.getByTestId('delete-model-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DELETE' } });

    const confirmBtn = screen.getByTestId('delete-model-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('target-id');
    });
  });
});
