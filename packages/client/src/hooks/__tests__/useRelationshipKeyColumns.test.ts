// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * useRelationshipKeyColumns unit coverage.
 *
 * Mocks the axios-based `api` singleton and asserts:
 *   1. Initial GET populates pairs + sourceHasNoPk
 *   2. `needsBackfill=true` triggers a silent POST + re-GET
 *   3. setPair(attrId, target) POSTs the full pair list with that
 *      one row updated, then refreshes state from response
 *   4. 409 on POST lands in `error` and is thrown
 *   5. null modelId OR null relId is a no-op (no network)
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: mocks,
}));

import { useRelationshipKeyColumns } from '../useRelationshipKeyColumns';

const MODEL_ID = '00000000-0000-4000-8000-00000000aaaa';
const REL_ID = '00000000-0000-4000-8000-00000000bbbb';
const SRC_ATTR_1 = '00000000-0000-4000-8000-0000000011aa';
const SRC_ATTR_2 = '00000000-0000-4000-8000-0000000011bb';
const TGT_ATTR_1 = '00000000-0000-4000-8000-0000000022aa';
const TGT_ATTR_X = '00000000-0000-4000-8000-0000000033aa';

function okResponse(body: unknown) {
  return { data: { data: body } };
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
});

describe('useRelationshipKeyColumns — initial load', () => {
  it('GETs the endpoint and exposes pairs + sourceHasNoPk', async () => {
    mocks.get.mockResolvedValueOnce(
      okResponse({
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

    const { result } = renderHook(() => useRelationshipKeyColumns(MODEL_ID, REL_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.pairs).toHaveLength(1);
    });
    expect(result.current.pairs[0].sourceAttributeName).toBe('customer_id');
    expect(result.current.sourceHasNoPk).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get.mock.calls[0][0]).toBe(
      `/model-studio/models/${MODEL_ID}/relationships/${REL_ID}/key-columns`,
    );
  });
});

describe('useRelationshipKeyColumns — silent backfill', () => {
  it('POSTs current pairs and re-GETs when needsBackfill=true', async () => {
    mocks.get
      .mockResolvedValueOnce(
        okResponse({
          pairs: [
            {
              sourceAttributeId: SRC_ATTR_1,
              sourceAttributeName: 'customer_id',
              targetAttributeId: null,
              targetAttributeName: null,
              isAutoCreated: false,
            },
          ],
          needsBackfill: true,
          sourceHasNoPk: false,
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
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
    mocks.post.mockResolvedValueOnce(
      okResponse({
        pairs: [],
        needsBackfill: false,
        sourceHasNoPk: false,
      }),
    );

    const { result } = renderHook(() => useRelationshipKeyColumns(MODEL_ID, REL_ID));

    await waitFor(() => {
      expect(result.current.pairs[0]?.targetAttributeId).toBe(TGT_ATTR_1);
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const postBody = mocks.post.mock.calls[0][1] as { pairs: Array<{ sourceAttributeId: string }> };
    expect(postBody.pairs).toEqual([{ sourceAttributeId: SRC_ATTR_1, targetAttributeId: null }]);
  });
});

describe('useRelationshipKeyColumns — setPair', () => {
  it('POSTs the full pair list with one row updated and refreshes state', async () => {
    mocks.get.mockResolvedValueOnce(
      okResponse({
        pairs: [
          {
            sourceAttributeId: SRC_ATTR_1,
            sourceAttributeName: 'customer_id',
            targetAttributeId: null,
            targetAttributeName: null,
            isAutoCreated: false,
          },
          {
            sourceAttributeId: SRC_ATTR_2,
            sourceAttributeName: 'tenant_id',
            targetAttributeId: null,
            targetAttributeName: null,
            isAutoCreated: false,
          },
        ],
        needsBackfill: false,
        sourceHasNoPk: false,
      }),
    );
    mocks.post.mockResolvedValueOnce(
      okResponse({
        pairs: [
          {
            sourceAttributeId: SRC_ATTR_1,
            sourceAttributeName: 'customer_id',
            targetAttributeId: TGT_ATTR_X,
            targetAttributeName: 'mailing_customer_ref',
            isAutoCreated: false,
          },
          {
            sourceAttributeId: SRC_ATTR_2,
            sourceAttributeName: 'tenant_id',
            targetAttributeId: null,
            targetAttributeName: null,
            isAutoCreated: false,
          },
        ],
        needsBackfill: false,
        sourceHasNoPk: false,
      }),
    );

    const { result } = renderHook(() => useRelationshipKeyColumns(MODEL_ID, REL_ID));
    await waitFor(() => expect(result.current.pairs).toHaveLength(2));

    await act(async () => {
      await result.current.setPair(SRC_ATTR_1, TGT_ATTR_X);
    });

    expect(mocks.post).toHaveBeenCalledTimes(1);
    const body = mocks.post.mock.calls[0][1] as {
      pairs: Array<{ sourceAttributeId: string; targetAttributeId: string | null }>;
    };
    expect(body.pairs).toEqual([
      { sourceAttributeId: SRC_ATTR_1, targetAttributeId: TGT_ATTR_X },
      { sourceAttributeId: SRC_ATTR_2, targetAttributeId: null },
    ]);
    expect(result.current.pairs[0].targetAttributeId).toBe(TGT_ATTR_X);
  });

  it('surfaces a 409 error and rethrows', async () => {
    mocks.get.mockResolvedValueOnce(
      okResponse({
        pairs: [
          {
            sourceAttributeId: SRC_ATTR_1,
            sourceAttributeName: 'customer_id',
            targetAttributeId: null,
            targetAttributeName: null,
            isAutoCreated: false,
          },
        ],
        needsBackfill: false,
        sourceHasNoPk: false,
      }),
    );
    const conflict = Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: 'attr already tagged for another rel' },
      },
    });
    mocks.post.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useRelationshipKeyColumns(MODEL_ID, REL_ID));
    await waitFor(() => expect(result.current.pairs).toHaveLength(1));

    let caught: unknown = null;
    await act(async () => {
      await result.current.setPair(SRC_ATTR_1, TGT_ATTR_X).catch((e) => {
        caught = e;
      });
    });
    expect(caught).toBeTruthy();
    expect(result.current.error).toBe('attr already tagged for another rel');
  });
});

describe('useRelationshipKeyColumns — null ids', () => {
  it('performs no network work when modelId or relId is null', async () => {
    interface Props {
      m: string | null;
      r: string | null;
    }
    const initial: Props = { m: null, r: null };
    const { result, rerender } = renderHook(({ m, r }: Props) => useRelationshipKeyColumns(m, r), {
      initialProps: initial,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.get).not.toHaveBeenCalled();

    rerender({ m: MODEL_ID, r: null } as Props);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.get).not.toHaveBeenCalled();

    rerender({ m: null, r: REL_ID } as Props);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
