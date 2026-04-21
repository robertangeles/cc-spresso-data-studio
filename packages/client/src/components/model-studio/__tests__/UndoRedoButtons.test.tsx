// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

import { UndoRedoButtons } from '../UndoRedoButtons';
import { UndoStackProvider, useUndoStack } from '../../../hooks/useUndoStack';
import { ToastProvider } from '../../ui/Toast';

const MODEL_ID = '00000000-0000-4000-8000-0000000000aa';

function Wrap({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UndoStackProvider modelId={MODEL_ID}>{children}</UndoStackProvider>
    </ToastProvider>
  );
}

/** Tiny helper that exposes `execute` to the test body so we can
 *  seed the stack without driving it via the canvas. */
function StackHarness({ onReady }: { onReady: (api: ReturnType<typeof useUndoStack>) => void }) {
  const api = useUndoStack();
  onReady(api);
  return null;
}

describe('UndoRedoButtons', () => {
  // Explicit cleanup between cases — RTL's automatic cleanup happens
  // on afterEach from `@testing-library/react/vitest` only if that
  // plugin is configured. Belt-and-braces: call it ourselves so
  // `screen.getByTestId` never sees two providers' buttons at once.
  afterEach(() => {
    cleanup();
  });

  it('1. disables both buttons when stacks are empty', () => {
    render(
      <Wrap>
        <UndoRedoButtons />
      </Wrap>,
    );
    const undoBtn = screen.getByTestId('undo-button') as HTMLButtonElement;
    const redoBtn = screen.getByTestId('redo-button') as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
  });

  it('2. ⌘Z triggers undo and ⌘⇧Z triggers redo', async () => {
    let apiRef: ReturnType<typeof useUndoStack> | null = null;
    render(
      <Wrap>
        <UndoRedoButtons />
        <StackHarness onReady={(api) => (apiRef = api)} />
      </Wrap>,
    );

    // Seed one completed + undone command so both stacks are populated.
    const forward = vi.fn(async () => 'ok');
    const inverse = vi.fn(async () => {});
    await act(async () => {
      await apiRef!.execute({ label: 'Create relationship', do: forward, undo: inverse });
    });

    // ⌘Z → inverse should fire.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'z', metaKey: true });
    });
    expect(inverse).toHaveBeenCalledTimes(1);

    // ⌘⇧Z → forward should fire again.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'z', metaKey: true, shiftKey: true });
    });
    expect(forward).toHaveBeenCalledTimes(2);
  });

  it('3. tooltip reflects the next command label', async () => {
    let apiRef: ReturnType<typeof useUndoStack> | null = null;
    render(
      <Wrap>
        <UndoRedoButtons />
        <StackHarness onReady={(api) => (apiRef = api)} />
      </Wrap>,
    );

    await act(async () => {
      await apiRef!.execute({
        label: 'Change notation to IDEF1X',
        do: async () => 'ok',
        undo: async () => {},
      });
    });

    const undoBtn = screen.getByTestId('undo-button') as HTMLButtonElement;
    expect(undoBtn.title).toContain('Change notation to IDEF1X');
    expect(undoBtn.getAttribute('aria-label')).toContain('Change notation to IDEF1X');
  });

  it('4. keyboard shortcut is swallowed when focus is in an <input>', async () => {
    let apiRef: ReturnType<typeof useUndoStack> | null = null;
    render(
      <Wrap>
        <UndoRedoButtons />
        <input data-testid="entity-name-input" />
        <StackHarness onReady={(api) => (apiRef = api)} />
      </Wrap>,
    );

    const inverse = vi.fn(async () => {});
    await act(async () => {
      await apiRef!.execute({
        label: 'Rename entity',
        do: async () => 'ok',
        undo: inverse,
      });
    });

    const input = screen.getByTestId('entity-name-input') as HTMLInputElement;
    input.focus();

    // Dispatch ⌘Z with the input as the event target. Browsers route
    // shortcut events to the focused element first; our handler must
    // ignore inputs so the native text-undo wins.
    await act(async () => {
      fireEvent.keyDown(input, { key: 'z', metaKey: true });
    });
    expect(inverse).not.toHaveBeenCalled();
  });
});
