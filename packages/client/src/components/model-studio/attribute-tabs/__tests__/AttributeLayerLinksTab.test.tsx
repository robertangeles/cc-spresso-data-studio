// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AttributeLink, ProjectionChainResponse } from '@cc/shared';
import type { AttributeSummary } from '../../../../hooks/useAttributes';
import { AttributeLayerLinksTab } from '../AttributeLayerLinksTab';

afterEach(() => cleanup());

const SELF_ID = '11111111-1111-1111-1111-111111111111';
const SELF_ATTR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARTNER_LOGICAL_ID = '22222222-2222-2222-2222-222222222222';
const PARTNER_PHYSICAL_ID = '33333333-3333-3333-3333-333333333333';

function makeAttr(id: string, name: string, entityId: string): AttributeSummary {
  return {
    id,
    entityId,
    name,
    businessName: null,
    description: null,
    dataType: 'varchar(64)',
    length: null,
    precision: null,
    scale: null,
    isNullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    isUnique: false,
    isExplicitUnique: false,
    defaultValue: null,
    classification: null,
    transformationLogic: null,
    altKeyGroup: null,
    ordinalPosition: 1,
    metadata: null,
    tags: null,
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  } as unknown as AttributeSummary;
}

const SELF_ATTR = makeAttr(SELF_ATTR_ID, 'unit_price', SELF_ID);
const LOGICAL_PRICE = makeAttr('p1', 'price', PARTNER_LOGICAL_ID);
const LOGICAL_NAME = makeAttr('n1', 'name', PARTNER_LOGICAL_ID);

function chainWithLogical(): ProjectionChainResponse {
  return {
    rootId: SELF_ID,
    nodes: [
      {
        entityId: SELF_ID,
        entityName: 'product',
        layer: 'physical',
        parentIds: [PARTNER_LOGICAL_ID],
        childIds: [],
      },
      {
        entityId: PARTNER_LOGICAL_ID,
        entityName: 'product',
        layer: 'logical',
        parentIds: [],
        childIds: [SELF_ID],
      },
    ],
  };
}

function chainTwoPartners(): ProjectionChainResponse {
  return {
    rootId: SELF_ID,
    nodes: [
      {
        entityId: SELF_ID,
        entityName: 'product',
        layer: 'logical',
        parentIds: [],
        childIds: [PARTNER_PHYSICAL_ID],
      },
      {
        entityId: PARTNER_LOGICAL_ID,
        entityName: 'Product',
        layer: 'conceptual',
        parentIds: [],
        childIds: [SELF_ID],
      },
      {
        entityId: PARTNER_PHYSICAL_ID,
        entityName: 'product_v2',
        layer: 'physical',
        parentIds: [SELF_ID],
        childIds: [],
      },
    ],
  };
}

interface RenderOpts {
  chain?: ProjectionChainResponse | null;
  links?: AttributeLink[];
  attributesByEntity?: Record<string, AttributeSummary[]>;
  onCreate?: (parentId: string, childId: string) => Promise<unknown>;
  onDelete?: (linkId: string) => Promise<void>;
  loadByParent?: (id: string) => Promise<unknown>;
  loadByChild?: (id: string) => Promise<unknown>;
}

function renderTab(opts: RenderOpts = {}) {
  // `chain` is passed verbatim — null is a meaningful value (no
  // partners, render empty state) so we must NOT collapse it via
  // nullish coalescing.
  const chain =
    'chain' in opts ? (opts.chain as ProjectionChainResponse | null) : chainWithLogical();
  const props = {
    entityId: SELF_ID,
    entityLayer: 'physical' as const,
    attribute: SELF_ATTR,
    chain,
    attributesByEntity: opts.attributesByEntity ?? {
      [PARTNER_LOGICAL_ID]: [LOGICAL_PRICE, LOGICAL_NAME],
    },
    links: opts.links ?? [],
    loadByParent: opts.loadByParent ?? vi.fn().mockResolvedValue([]),
    loadByChild: opts.loadByChild ?? vi.fn().mockResolvedValue([]),
    onCreate: opts.onCreate ?? vi.fn().mockResolvedValue({}),
    onDelete: opts.onDelete ?? vi.fn().mockResolvedValue(undefined),
  };
  return { ...render(<AttributeLayerLinksTab {...props} />), props };
}

describe('AttributeLayerLinksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state hint when the chain is null', () => {
    renderTab({ chain: null });
    expect(screen.getByTestId('attribute-layer-links-empty')).toBeTruthy();
  });

  it('shows the empty-state hint when the chain has no partners (only self)', () => {
    renderTab({
      chain: {
        rootId: SELF_ID,
        nodes: [
          {
            entityId: SELF_ID,
            entityName: 'product',
            layer: 'physical',
            parentIds: [],
            childIds: [],
          },
        ],
      },
    });
    expect(screen.getByTestId('attribute-layer-links-empty')).toBeTruthy();
  });

  it('renders one row per partner entity (excluding self)', () => {
    renderTab({ chain: chainTwoPartners() });
    expect(screen.getByTestId(`attribute-link-row-${PARTNER_LOGICAL_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`attribute-link-row-${PARTNER_PHYSICAL_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`attribute-link-row-${SELF_ID}`)).toBeNull();
  });

  it('the dropdown defaults to "— not linked —" when no link exists', () => {
    renderTab();
    const select = screen.getByTestId(
      `attribute-link-select-${PARTNER_LOGICAL_ID}`,
    ) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('the dropdown pre-selects the linked attribute when the focused attr is the link PARENT', () => {
    const link: AttributeLink = {
      id: 'link-1',
      parentId: SELF_ATTR_ID,
      parentName: 'unit_price',
      parentEntityId: SELF_ID,
      parentLayer: 'physical',
      childId: LOGICAL_PRICE.id,
      childName: 'price',
      childEntityId: PARTNER_LOGICAL_ID,
      childLayer: 'logical',
      linkType: 'layer_projection',
      createdAt: '2026-04-27T00:00:00.000Z',
    };
    renderTab({ links: [link] });
    const select = screen.getByTestId(
      `attribute-link-select-${PARTNER_LOGICAL_ID}`,
    ) as HTMLSelectElement;
    expect(select.value).toBe(LOGICAL_PRICE.id);
  });

  it('the dropdown pre-selects the linked attribute when the focused attr is the link CHILD (bidirectional)', () => {
    // Same link as above, but viewed from the OTHER side: the focused
    // attribute is the child, so the partner attribute is the parent.
    const link: AttributeLink = {
      id: 'link-1',
      parentId: LOGICAL_PRICE.id,
      parentName: 'price',
      parentEntityId: PARTNER_LOGICAL_ID,
      parentLayer: 'logical',
      childId: SELF_ATTR_ID,
      childName: 'unit_price',
      childEntityId: SELF_ID,
      childLayer: 'physical',
      linkType: 'layer_projection',
      createdAt: '2026-04-27T00:00:00.000Z',
    };
    renderTab({ links: [link] });
    const select = screen.getByTestId(
      `attribute-link-select-${PARTNER_LOGICAL_ID}`,
    ) as HTMLSelectElement;
    // Even though the focused attr is the child, the dropdown should
    // show the PARENT id (the partner side) as the selected value.
    expect(select.value).toBe(LOGICAL_PRICE.id);
  });

  it('triggers loadByParent + loadByChild on mount with the focused attribute id', async () => {
    const loadByParent = vi.fn().mockResolvedValue([]);
    const loadByChild = vi.fn().mockResolvedValue([]);
    renderTab({ loadByParent, loadByChild });
    await waitFor(() => {
      expect(loadByParent).toHaveBeenCalledWith(SELF_ATTR_ID);
      expect(loadByChild).toHaveBeenCalledWith(SELF_ATTR_ID);
    });
  });

  it('picking a target attribute fires onCreate(parentId, childId)', async () => {
    const onCreate = vi.fn().mockResolvedValue({});
    renderTab({ onCreate });
    fireEvent.change(screen.getByTestId(`attribute-link-select-${PARTNER_LOGICAL_ID}`), {
      target: { value: LOGICAL_PRICE.id },
    });
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(SELF_ATTR_ID, LOGICAL_PRICE.id));
  });

  it('picking "— not linked —" on a row that has an existing link fires onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const link: AttributeLink = {
      id: 'link-1',
      parentId: SELF_ATTR_ID,
      parentName: 'unit_price',
      parentEntityId: SELF_ID,
      parentLayer: 'physical',
      childId: LOGICAL_PRICE.id,
      childName: 'price',
      childEntityId: PARTNER_LOGICAL_ID,
      childLayer: 'logical',
      linkType: 'layer_projection',
      createdAt: '2026-04-27T00:00:00.000Z',
    };
    renderTab({ links: [link], onDelete });
    fireEvent.change(screen.getByTestId(`attribute-link-select-${PARTNER_LOGICAL_ID}`), {
      target: { value: '' },
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('link-1'));
  });

  it('swapping to a different target deletes the old link AND creates the new one', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onCreate = vi.fn().mockResolvedValue({});
    const link: AttributeLink = {
      id: 'link-1',
      parentId: SELF_ATTR_ID,
      parentName: 'unit_price',
      parentEntityId: SELF_ID,
      parentLayer: 'physical',
      childId: LOGICAL_PRICE.id,
      childName: 'price',
      childEntityId: PARTNER_LOGICAL_ID,
      childLayer: 'logical',
      linkType: 'layer_projection',
      createdAt: '2026-04-27T00:00:00.000Z',
    };
    renderTab({ links: [link], onDelete, onCreate });
    fireEvent.change(screen.getByTestId(`attribute-link-select-${PARTNER_LOGICAL_ID}`), {
      target: { value: LOGICAL_NAME.id },
    });
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('link-1');
      expect(onCreate).toHaveBeenCalledWith(SELF_ATTR_ID, LOGICAL_NAME.id);
    });
  });

  it('failed create surfaces an inline error and flags the row data-state="failed"', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Already linked'));
    renderTab({ onCreate });
    fireEvent.change(screen.getByTestId(`attribute-link-select-${PARTNER_LOGICAL_ID}`), {
      target: { value: LOGICAL_PRICE.id },
    });
    await waitFor(() =>
      expect(screen.getByTestId(`attribute-link-error-${PARTNER_LOGICAL_ID}`)).toBeTruthy(),
    );
    expect(
      screen.getByTestId(`attribute-link-row-${PARTNER_LOGICAL_ID}`).getAttribute('data-state'),
    ).toBe('failed');
  });
});
