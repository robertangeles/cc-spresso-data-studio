// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EditModelDialog } from '../EditModelDialog';
import type { DataModelSummary } from '../../../hooks/useModels';

afterEach(() => cleanup());

const makeModel = (overrides: Partial<DataModelSummary> = {}): DataModelSummary => ({
  id: 'm1',
  projectId: 'p1',
  ownerId: 'u1',
  name: 'Customer Domain',
  description: 'Original description',
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

describe('EditModelDialog', () => {
  it('renders pre-filled with the model name and description', () => {
    const model = makeModel({ name: 'Orders', description: 'All order-related entities' });
    render(<EditModelDialog model={model} onClose={() => {}} onSave={async () => {}} />);

    const nameInput = screen.getByTestId('edit-model-name') as HTMLInputElement;
    const descInput = screen.getByTestId('edit-model-description') as HTMLTextAreaElement;
    expect(nameInput.value).toBe('Orders');
    expect(descInput.value).toBe('All order-related entities');
  });

  it('calls onSave with trimmed values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const model = makeModel({ name: 'Old', description: 'Old desc' });
    render(<EditModelDialog model={model} onClose={() => {}} onSave={onSave} />);

    const nameInput = screen.getByTestId('edit-model-name') as HTMLInputElement;
    const descInput = screen.getByTestId('edit-model-description') as HTMLTextAreaElement;

    fireEvent.change(nameInput, { target: { value: '   Renamed Model   ' } });
    fireEvent.change(descInput, { target: { value: '  Fresh description  ' } });

    fireEvent.click(screen.getByTestId('edit-model-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: 'Renamed Model',
        description: 'Fresh description',
      });
    });
  });

  it('disables the save button while submitting', async () => {
    let resolveSave: (() => void) | null = null;
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveSave = res;
        }),
    );
    const model = makeModel({ name: 'Before' });
    render(<EditModelDialog model={model} onClose={() => {}} onSave={onSave} />);

    const nameInput = screen.getByTestId('edit-model-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'After' } });

    const saveBtn = screen.getByTestId('edit-model-save') as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.disabled).toBe(true);
      expect(saveBtn.textContent).toContain('Saving');
    });

    await act(async () => {
      resolveSave?.();
    });
  });
});
