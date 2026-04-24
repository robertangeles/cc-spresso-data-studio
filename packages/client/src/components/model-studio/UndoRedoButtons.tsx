import { useEffect } from 'react';
import { useUndoStack } from '../../hooks/useUndoStack';

/**
 * Step 6 — canvas-header undo / redo affordances.
 *
 * Two glass-morphism buttons sitting alongside NotationSwitcher,
 * TidyButton, Orphan dots toggle, and Infer rels. Disabled when
 * their stack is empty; tooltip reveals the next command label.
 *
 * Keyboard shortcuts attach to `document` once:
 *   - ⌘Z / Ctrl+Z       → undo
 *   - ⌘⇧Z / Ctrl+⇧Z     → redo
 *
 * Focus inside an input / textarea / contenteditable swallows the
 * shortcut so the browser's native text-editing undo wins — users
 * renaming an entity or typing a rel name shouldn't accidentally
 * reverse a canvas mutation.
 *
 * The hook lives here (not in `useUndoStack`) so the provider stays
 * UI-agnostic — unit tests for the stack don't need a document to
 * attach keyboard listeners to.
 */

const UNDO_TESTID = 'undo-button';
const REDO_TESTID = 'redo-button';

export function UndoRedoButtons() {
  const { canUndo, canRedo, undo, redo, nextUndoLabel, nextRedoLabel } = useUndoStack();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only Cmd (Mac) or Ctrl (Win/Linux). Alt + Meta combos are
      // reserved by the OS — don't steal them.
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // z is the only key we care about here; bail fast on everything else.
      if (e.key !== 'z' && e.key !== 'Z') return;

      // Swallow when typing in an input/textarea/contenteditable so the
      // browser's native text-undo wins (users typing an entity name
      // must not inadvertently reverse a rel mutation).
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }

      if (e.shiftKey) {
        e.preventDefault();
        void redo();
      } else {
        e.preventDefault();
        void undo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const undoTitle = canUndo
    ? `Undo${nextUndoLabel ? `: ${nextUndoLabel}` : ''} (⌘Z)`
    : 'Nothing to undo';
  const redoTitle = canRedo
    ? `Redo${nextRedoLabel ? `: ${nextRedoLabel}` : ''} (⌘⇧Z)`
    : 'Nothing to redo';

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-2/70 px-1 py-0.5 backdrop-blur-xl">
      <button
        type="button"
        data-testid={UNDO_TESTID}
        aria-label={undoTitle}
        title={undoTitle}
        onClick={() => void undo()}
        disabled={!canUndo}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
      >
        <span aria-hidden="true">↶</span>
        <span>Undo</span>
      </button>
      <div className="h-3 w-px bg-white/10" aria-hidden="true" />
      <button
        type="button"
        data-testid={REDO_TESTID}
        aria-label={redoTitle}
        title={redoTitle}
        onClick={() => void redo()}
        disabled={!canRedo}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
      >
        <span aria-hidden="true">↷</span>
        <span>Redo</span>
      </button>
    </div>
  );
}
