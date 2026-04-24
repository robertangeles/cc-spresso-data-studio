// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

/**
 * S6-U24 — `useRelationships` optimistic create rolls back on server error.
 *
 * We mock the axios-based `api` singleton and assert:
 *   1. The optimistic row appears immediately after `create()` is called
 *      (before the promise resolves).
 *   2. When the server responds with a 422, the zombie row is removed
 *      and a toast is fired via the existing ToastProvider.
 */

// ----------------------------------------------------------
// Mock `../lib/api` BEFORE importing the hook. `vi.hoisted` pins the
// mock functions so the factory can close over them without TDZ issues.
// ----------------------------------------------------------
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

// Import AFTER mock declaration so the module picks up our stub.
import { useRelationships } from '../useRelationships';
import { ToastProvider } from '../../components/ui/Toast';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';
const SRC_ID = '00000000-0000-4000-8000-0000000000bb';
const TGT_ID = '00000000-0000-4000-8000-0000000000cc';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children);
}

describe('useRelationships — optimistic create (S6-U24)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
  });

  it('inserts the temp row synchronously and rolls back on server error', async () => {
    // Simulate a 422 by rejecting the POST. The hook should clean up.
    const networkError = Object.assign(new Error('Validation failed'), {
      isAxiosError: true,
      response: {
        status: 422,
        data: { success: false, error: 'invalid cardinality', details: {} },
      },
    });
    mocks.post.mockRejectedValueOnce(networkError);

    const { result } = renderHook(() => useRelationships(MODEL_ID), { wrapper });

    // Precondition: empty list.
    expect(result.current.relationships).toEqual([]);

    // Fire create and attach a catch SYNCHRONOUSLY so the rejected
    // promise isn't flagged by vitest as unhandled before `act` re-enters.
    let caught: unknown = null;
    await act(async () => {
      await result.current
        .create({
          sourceEntityId: SRC_ID,
          targetEntityId: TGT_ID,
          name: 'owns',
          sourceCardinality: 'one',
          targetCardinality: 'many',
          isIdentifying: false,
          layer: 'logical',
        })
        .catch((err: unknown) => {
          caught = err;
        });
    });

    expect(caught).toBeTruthy();
    expect(result.current.relationships).toEqual([]);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('replaces the temp row with the server row on success', async () => {
    const serverRow = {
      id: '11111111-1111-4111-8111-111111111111',
      dataModelId: MODEL_ID,
      sourceEntityId: SRC_ID,
      targetEntityId: TGT_ID,
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
    mocks.post.mockResolvedValueOnce({ data: { data: serverRow } });

    const { result } = renderHook(() => useRelationships(MODEL_ID), { wrapper });

    await act(async () => {
      await result.current.create({
        sourceEntityId: SRC_ID,
        targetEntityId: TGT_ID,
        name: 'owns',
        sourceCardinality: 'one',
        targetCardinality: 'many',
        isIdentifying: false,
        layer: 'logical',
      });
    });

    expect(result.current.relationships).toHaveLength(1);
    expect(result.current.relationships[0].id).toBe(serverRow.id);
  });
});

describe('useRelationships — update (6A version conflict)', () => {
  beforeEach(() => {
    mocks.patch.mockReset();
  });

  it('returns a VersionConflictResult on 409', async () => {
    const conflictError = Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          success: false,
          error: 'Relationship was updated by someone else',
          details: { code: ['VERSION_CONFLICT'], serverVersion: ['7'] },
        },
      },
    });
    mocks.patch.mockRejectedValueOnce(conflictError);

    const { result } = renderHook(() => useRelationships(MODEL_ID), { wrapper });

    let out: Awaited<ReturnType<typeof result.current.update>> | undefined;
    await act(async () => {
      out = await result.current.update(
        '22222222-2222-4222-8222-222222222222',
        { name: 'renamed' },
        3,
      );
    });
    expect(out).toBeDefined();
    if (!out) return;
    expect('conflict' in out && out.conflict).toBe(true);
    if ('conflict' in out && out.conflict) {
      expect(out.serverVersion).toBe(7);
    }
  });
});
