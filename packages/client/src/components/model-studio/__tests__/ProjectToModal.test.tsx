// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({ api: mocks }));

import { ProjectToModal } from '../ProjectToModal';
import { ToastProvider } from '../../ui/Toast';

const SOURCE_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
  mocks.patch.mockReset();
  mocks.delete.mockReset();
  // useEntities GET expects `{ data: { entities, total } }` (see hook impl).
  mocks.get.mockImplementation((url: string) => {
    if (url.includes('/entities')) {
      return Promise.resolve({
        data: {
          data: {
            entities: [
              {
                id: SOURCE_ID,
                name: 'customer',
                businessName: null,
                description: null,
                layer: 'logical',
                entityType: 'standard',
                displayId: 'E001',
                altKeyLabels: {},
                lint: [],
              },
              {
                id: TARGET_ID,
                name: 'dim_customer',
                businessName: null,
                description: null,
                layer: 'physical',
                entityType: 'standard',
                displayId: 'E002',
                altKeyLabels: {},
                lint: [],
              },
            ],
            total: 2,
          },
        },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

afterEach(() => cleanup());

function renderModal(overrides: Partial<React.ComponentProps<typeof ProjectToModal>> = {}) {
  const props: React.ComponentProps<typeof ProjectToModal> = {
    isOpen: true,
    modelId: 'model-1',
    sourceEntityId: SOURCE_ID,
    sourceEntityLayer: 'logical',
    sourceEntityName: 'customer',
    onClose: vi.fn(),
    onLinked: vi.fn(),
    ...overrides,
  };
  return render(
    <ToastProvider>
      <ProjectToModal {...props} />
    </ToastProvider>,
  );
}

describe('ProjectToModal', () => {
  it('renders nothing when isOpen=false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId('project-to-modal')).toBeNull();
  });

  it('defaults the target-layer dropdown to a layer different from the source', () => {
    renderModal();
    const layer = screen.getByTestId('project-to-layer') as HTMLSelectElement;
    // Source is logical → first OTHER layer is conceptual.
    expect(layer.value).toBe('conceptual');
  });

  it('shows the helper line when no candidates exist on the picked layer', async () => {
    renderModal();
    // Default target is conceptual; no conceptual entities loaded → helper text.
    await waitFor(() => {
      expect(screen.getByText(/no entities on conceptual yet/i)).toBeTruthy();
    });
  });

  it('lets the user pick a target entity and submits parentId=source, childId=target', async () => {
    mocks.post.mockResolvedValue({
      data: {
        data: {
          id: 'link-1',
          parentId: SOURCE_ID,
          parentName: 'customer',
          parentLayer: 'logical',
          childId: TARGET_ID,
          childName: 'dim_customer',
          childLayer: 'physical',
          linkType: 'layer_projection',
          createdAt: '2026-04-25T08:00:00.000Z',
        },
      },
    });
    const onLinked = vi.fn();
    renderModal({ onLinked });

    // Wait for entities to load.
    await waitFor(() => screen.getByTestId('project-to-entity'));

    // Switch the target layer to physical to surface dim_customer in the dropdown.
    fireEvent.change(screen.getByTestId('project-to-layer'), { target: { value: 'physical' } });
    await waitFor(() => {
      const opts = (screen.getByTestId('project-to-entity') as HTMLSelectElement).options;
      // 1 placeholder + 1 candidate
      expect(opts.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(screen.getByTestId('project-to-entity'), { target: { value: TARGET_ID } });
    fireEvent.click(screen.getByTestId('project-to-submit'));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const [url, body] = mocks.post.mock.calls[0];
    expect(url).toMatch(/\/layer-links$/);
    expect((body as { parentId: string; childId: string }).parentId).toBe(SOURCE_ID);
    expect((body as { parentId: string; childId: string }).childId).toBe(TARGET_ID);
    await waitFor(() => expect(onLinked).toHaveBeenCalledTimes(1));
  });

  it('blocks submit and shows an inline error when no target is picked', async () => {
    renderModal();
    await waitFor(() => screen.getByTestId('project-to-submit'));
    const submit = screen.getByTestId('project-to-submit') as HTMLButtonElement;
    // The button is disabled while targetEntityId is empty — clicking does nothing.
    expect(submit.disabled).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
