// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Relationship } from '@cc/shared';
import { RelationshipPanel } from '../RelationshipPanel';
import { ToastProvider } from '../../ui/Toast';
import { UndoStackProvider } from '../../../hooks/useUndoStack';
import type { EntitySummary } from '../../../hooks/useEntities';

afterEach(() => cleanup());

/**
 * Smoke + Key-Columns coverage for RelationshipPanel. Full flow
 * coverage lives in the E2E tier — here we assert the panel mounts,
 * surfaces tabs, and renders/interacts with the Key Columns section.
 */

// Mock `api` so the Key Columns hook + useAttributes hook have no real
// network — wire per-test responses via `mocks.get` / `mocks.post`.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));
vi.mock('../../../lib/api', () => ({
  api: mocks,
}));

const MODEL_ID = 'mdl-1';
const REL_ID = 'rel-1';
const SRC_ID = 'ent-a';
const TGT_ID = 'ent-b';
const SRC_ATTR_1 = 'src-attr-1';
const TGT_ATTR_1 = 'tgt-attr-1';
const TGT_ATTR_X = 'tgt-attr-x';

const rel: Relationship = {
  id: REL_ID,
  dataModelId: MODEL_ID,
  sourceEntityId: SRC_ID,
  targetEntityId: TGT_ID,
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
    id: SRC_ID,
    dataModelId: MODEL_ID,
    name: 'Customer',
    businessName: null,
    description: null,
    layer: 'logical',
    entityType: 'standard',
    displayId: null,
    altKeyLabels: {},
    metadata: {},
    tags: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    lint: [],
  },
  {
    id: TGT_ID,
    dataModelId: MODEL_ID,
    name: 'Order',
    businessName: null,
    description: null,
    layer: 'logical',
    entityType: 'standard',
    displayId: null,
    altKeyLabels: {},
    metadata: {},
    tags: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    lint: [],
  },
];

function okData(body: unknown) {
  return { data: { data: body } };
}

function renderPanel(r: Relationship | null) {
  return render(
    <ToastProvider>
      <UndoStackProvider modelId={MODEL_ID}>
        <RelationshipPanel
          relationship={r}
          entities={entities}
          auditEvents={[]}
          auditLoading={false}
          onClose={() => {}}
          onUpdate={vi.fn()}
          onDelete={async () => {}}
          onConflict={() => {}}
        />
      </UndoStackProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.patch.mockReset();
  mocks.delete.mockReset();
  mocks.put.mockReset();
});

describe('RelationshipPanel — smoke', () => {
  it('renders header with src→tgt and all 6 tabs', async () => {
    // Default: empty key columns + empty target attrs — the Key Columns
    // section still mounts with a "No key columns yet." placeholder.
    mocks.get.mockImplementation((url: string) => {
      if (url.includes('/key-columns')) {
        return Promise.resolve(okData({ pairs: [], needsBackfill: false, sourceHasNoPk: false }));
      }
      if (url.includes('/attributes')) {
        return Promise.resolve(okData({ attributes: [], total: 0 }));
      }
      return Promise.resolve(okData({}));
    });

    renderPanel(rel);
    expect(screen.getByTestId('relationship-panel')).toBeTruthy();
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Order').length).toBeGreaterThan(0);
    for (const id of ['general', 'cardinality', 'governance', 'audit', 'rules', 'appearance']) {
      expect(screen.getByTestId(`rel-tab-${id}`)).toBeTruthy();
    }
    await waitFor(() => {
      expect(screen.getByTestId('relationship-key-columns')).toBeTruthy();
    });
  });

  it('returns null when no relationship is selected', () => {
    const { container } = renderPanel(null);
    expect(container.querySelector('[data-testid="relationship-panel"]')).toBeNull();
  });
});

describe('RelationshipPanel — Key Columns section', () => {
  it('shows the "source has no PK" amber banner when server reports it', async () => {
    mocks.get.mockImplementation((url: string) => {
      if (url.includes('/key-columns')) {
        return Promise.resolve(okData({ pairs: [], needsBackfill: false, sourceHasNoPk: true }));
      }
      if (url.includes('/attributes')) {
        return Promise.resolve(okData({ attributes: [], total: 0 }));
      }
      return Promise.resolve(okData({}));
    });

    renderPanel(rel);
    await waitFor(() => {
      expect(screen.getByTestId('rel-key-columns-no-pk')).toBeTruthy();
    });
    expect(screen.getByTestId('rel-key-columns-no-pk').textContent).toMatch(/no primary key/i);
  });

  it('lists target-entity attrs as options and POSTs on change', async () => {
    mocks.get.mockImplementation((url: string) => {
      if (url.includes('/key-columns')) {
        return Promise.resolve(
          okData({
            pairs: [
              {
                sourceAttributeId: SRC_ATTR_1,
                sourceAttributeName: 'customer_id',
                targetAttributeId: TGT_ATTR_1,
                targetAttributeName: 'customer_id',
                isAutoCreated: true,
              },
            ],
            needsBackfill: false,
            sourceHasNoPk: false,
          }),
        );
      }
      if (url.includes(`/entities/${TGT_ID}/attributes`)) {
        return Promise.resolve(
          okData({
            attributes: [
              makeAttr(TGT_ATTR_1, 'customer_id', 1),
              makeAttr(TGT_ATTR_X, 'mailing_customer_ref', 2),
            ],
            total: 2,
          }),
        );
      }
      return Promise.resolve(okData({}));
    });

    mocks.post.mockResolvedValueOnce(
      okData({
        pairs: [
          {
            sourceAttributeId: SRC_ATTR_1,
            sourceAttributeName: 'customer_id',
            targetAttributeId: TGT_ATTR_X,
            targetAttributeName: 'mailing_customer_ref',
            isAutoCreated: false,
          },
        ],
        needsBackfill: false,
        sourceHasNoPk: false,
      }),
    );

    renderPanel(rel);

    const select = (await waitFor(() =>
      screen.getByTestId(`rel-key-column-select-${SRC_ATTR_1}`),
    )) as HTMLSelectElement;

    // Wait until the target attrs have loaded and are present as options.
    await waitFor(() => {
      const labels = Array.from(select.options).map((o) => o.textContent ?? '');
      expect(labels.some((l) => l.includes('mailing_customer_ref'))).toBe(true);
    });
    const optionLabels = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(optionLabels.some((l) => l.includes('Auto-create'))).toBe(true);

    // Change to TGT_ATTR_X → POST fires with full pair list.
    fireEvent.change(select, { target: { value: TGT_ATTR_X } });

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const postCall = mocks.post.mock.calls[0];
    expect(postCall[0]).toBe(
      `/model-studio/models/${MODEL_ID}/relationships/${REL_ID}/key-columns`,
    );
    const body = postCall[1] as {
      pairs: Array<{ sourceAttributeId: string; targetAttributeId: string | null }>;
    };
    expect(body.pairs).toEqual([{ sourceAttributeId: SRC_ATTR_1, targetAttributeId: TGT_ATTR_X }]);
  });
});

function makeAttr(id: string, name: string, ord: number) {
  return {
    id,
    entityId: TGT_ID,
    name,
    businessName: null,
    description: null,
    dataType: 'uuid',
    length: null,
    precision: null,
    scale: null,
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    isUnique: false,
    defaultValue: null,
    classification: null,
    transformationLogic: null,
    altKeyGroup: null,
    ordinalPosition: ord,
    metadata: {},
    tags: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    lint: [],
  };
}
