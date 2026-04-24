// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

/**
 * Step 6 — `useUndoStack` unit coverage.
 *
 * Locked scope from `tasks/alignment-step6-patch.md` §2.5:
 *   1. execute runs do + pushes; subsequent undo runs inverse
 *   2. undo + redo round-trip returns to the same state
 *   3. stack capacity caps at 50 (51st push evicts oldest)
 *   4. execute when forward throws → nothing pushed, error rethrows
 *   5. undo when inverse throws → toast fires + stack cleared
 *   6. clear on modelId change
 */

import {
  UndoStackProvider,
  useUndoStack,
  NotUndoableError,
  UNDO_STACK_LIMIT,
} from '../useUndoStack';
import { ToastProvider } from '../../components/ui/Toast';

const MODEL_A = '00000000-0000-4000-8000-000000000aaa';
const MODEL_B = '00000000-0000-4000-8000-000000000bbb';

/** Wrap the hook in the toast + undo providers. `modelId` is
 *  parameterised so one test can remount across models. */
function makeWrapper(modelId: string | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // Use Fragment + explicit nesting so TypeScript sees the children
    // prop on each provider (ProviderProps requires it) while ESLint's
    // react/no-children-prop rule still passes — createElement's
    // positional children arg is the lint-approved escape from the
    // JSX-only rule, but TS still needs the type to satisfy. We cast
    // the wrapper around Provider to accept children via positional.
    const undoTree = createElement(
      UndoStackProvider as unknown as (props: { modelId?: string }) => JSX.Element,
      { modelId },
      children,
    );
    return createElement(ToastProvider, null, undoTree);
  };
}

describe('useUndoStack', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('1. execute runs forward and a subsequent undo runs inverse', async () => {
    const state = { value: 0 };
    const forward = vi.fn(async () => {
      state.value = 1;
      return state.value;
    });
    const inverse = vi.fn(async () => {
      state.value = 0;
    });

    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    await act(async () => {
      await result.current.execute({ label: 'Set to 1', do: forward, undo: inverse });
    });

    expect(forward).toHaveBeenCalledTimes(1);
    expect(state.value).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.nextUndoLabel).toBe('Set to 1');

    await act(async () => {
      await result.current.undo();
    });

    expect(inverse).toHaveBeenCalledTimes(1);
    expect(state.value).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.nextRedoLabel).toBe('Set to 1');
  });

  it('2. undo + redo round-trip returns to the same state', async () => {
    const state = { value: 0 };
    const cmd = {
      label: 'Increment',
      do: async () => {
        state.value += 1;
        return state.value;
      },
      undo: async () => {
        state.value -= 1;
      },
    };

    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    await act(async () => {
      await result.current.execute(cmd);
    });
    expect(state.value).toBe(1);

    await act(async () => {
      await result.current.undo();
    });
    expect(state.value).toBe(0);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redo();
    });
    expect(state.value).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('3. stack capacity: 51st push evicts the oldest frame', async () => {
    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    // Push UNDO_STACK_LIMIT + 1 commands. Each has a unique label so
    // we can tell which one remains at the tail after overflow.
    for (let i = 0; i < UNDO_STACK_LIMIT + 1; i += 1) {
      const i_ = i;
      await act(async () => {
        await result.current.execute({
          label: `cmd-${i_}`,
          do: async () => i_,
          undo: async () => {},
        });
      });
    }

    // Top-of-stack is the newest (cmd-50 is the 51st push, 0-indexed).
    expect(result.current.nextUndoLabel).toBe(`cmd-${UNDO_STACK_LIMIT}`);

    // Drain the stack — we should get exactly UNDO_STACK_LIMIT undos
    // before it empties, because the oldest (cmd-0) was evicted.
    let undosRun = 0;
    while (result.current.canUndo) {
      await act(async () => {
        await result.current.undo();
      });
      undosRun += 1;
      if (undosRun > UNDO_STACK_LIMIT + 5) break; // infinite-loop guard
    }
    expect(undosRun).toBe(UNDO_STACK_LIMIT);
  });

  it('4. execute rethrows on forward failure and pushes nothing', async () => {
    const bang = new Error('server 500');
    const forward = vi.fn(async () => {
      throw bang;
    });
    const inverse = vi.fn(async () => {});

    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.execute({ label: 'will fail', do: forward, undo: inverse });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBe(bang);
    expect(inverse).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('5. undo fires toast and clears stack when inverse throws', async () => {
    // Spy on the toast context by capturing it via a child component.
    // Easier: assert via a DOM side-effect — the ToastProvider renders
    // a toast container. We check role="alert-like" region by text.
    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    // Push two frames. First inverse will explode. Stack should be
    // fully cleared (not just the failing frame) so subsequent Cmd+Z
    // can't stomp on unrelated state.
    await act(async () => {
      await result.current.execute({
        label: 'good',
        do: async () => 'x',
        undo: async () => {},
      });
      await result.current.execute({
        label: 'poison',
        do: async () => 'y',
        undo: async () => {
          throw new Error('drift');
        },
      });
    });
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    // Toast body is rendered into the DOM by the ToastProvider. Query
    // it by the locked message string (see useUndoStack.ts).
    expect(document.body.textContent).toContain('Undo failed — server state changed');
  });

  it('5b. NotUndoableError in inverse clears stack silently, no toast', async () => {
    // Capture the toast container so we can query ONLY the current
    // container's children (previous tests may leave toast DOM behind
    // in the shared jsdom body until their auto-dismiss timer runs).
    const before = document.body.textContent ?? '';
    const { result } = renderHook(() => useUndoStack(), { wrapper: makeWrapper(MODEL_A) });

    await act(async () => {
      await result.current.execute({
        label: 'Delete entity',
        do: async () => 'deleted',
        undo: async () => {
          throw new NotUndoableError('Entity deletion is not reversible in MVP');
        },
      });
    });
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    // Assert the NEW delta after the undo call does NOT introduce the
    // failure-toast string. Previous test's toast (if still present)
    // contributes only to `before`, so the diff is all we care about.
    const after = document.body.textContent ?? '';
    const delta = after.slice(before.length);
    expect(delta).not.toContain('Undo failed — server state changed');
  });

  it('6. changing modelId clears both stacks', async () => {
    let modelId = MODEL_A;
    const { result, rerender } = renderHook(() => useUndoStack(), {
      wrapper: (props: { children: ReactNode }) => {
        const Wrapper = makeWrapper(modelId);
        return createElement(Wrapper, null, props.children);
      },
    });

    // Push 3 commands under model A.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await result.current.execute({
          label: `a-${i}`,
          do: async () => i,
          undo: async () => {},
        });
      });
    }
    expect(result.current.canUndo).toBe(true);

    // Switch to model B and rerender.
    modelId = MODEL_B;
    await act(async () => {
      rerender();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.nextUndoLabel).toBeNull();
  });
});
