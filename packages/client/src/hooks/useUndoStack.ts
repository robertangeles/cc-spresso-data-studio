import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useToast } from '../components/ui/Toast';

/**
 * Step 6 — model-studio undo / redo stack.
 *
 * Architecture (locked in `tasks/alignment-step6-patch.md` §2):
 *
 *  - The stack is a React context singleton, scoped per `modelId`.
 *    Navigating to a different model clears both undo + redo stacks;
 *    cross-model undo would replay mutations against the wrong target.
 *  - Every mutation on the canvas (rels, attrs, entity CRUD except
 *    delete, notation flip, node drag) flows through `execute(cmd)`.
 *  - Each `UndoCommand` pairs a forward `do` with an `undo` that
 *    receives the pre-execution snapshot + the forward result, so the
 *    inverse can reference server-assigned ids (e.g. a created rel's
 *    new UUID when we need to delete it back out).
 *  - On forward throw → nothing pushed, error rethrown, stacks
 *    untouched. The existing hook-level toasts continue to surface
 *    the failure.
 *  - On inverse throw during `undo()` → we clear the undo stack and
 *    surface a `toast('Undo failed — server state changed', 'error')`.
 *    The server and client have diverged; further undos could silently
 *    stomp on unrelated state.
 *  - Max 50 entries. Oldest is silently evicted on overflow.
 *
 * Entity DELETE is deliberately NOT undoable in MVP — the cascade
 * fans out across attributes, relationships, layer_links, canvas
 * positions, and audit rows. A faithful restore requires either
 * soft-delete tombstones or an ID-preserving restore endpoint; both
 * are multi-night investments. Callers should still route delete
 * through `execute` with an `undo` that throws `NotUndoableError` so
 * the stack is cleared (Cmd+Z can't resurrect the entity and must
 * not attempt to undo older commands against an inconsistent model).
 */

export interface UndoCommand<TResult = unknown, TSnapshot = unknown> {
  /** Human-readable label — shown in the button tooltip + toasts. */
  label: string;
  /** Forward action. Its return value is passed to `undo`. */
  do: () => Promise<TResult>;
  /** Inverse action. Receives the pre-execution snapshot plus the
   *  forward result (e.g. a server-assigned id). */
  undo: (snapshot: TSnapshot, result: TResult) => Promise<void>;
  /** Optional pre-execution snapshot. Captured before `do` runs. */
  snapshot?: TSnapshot;
}

/** Thrown by an `undo` function when a mutation is intentionally
 *  irreversible (entity delete in MVP). The stack is cleared, no
 *  toast is fired — the intent is to turn Cmd+Z into a no-op rather
 *  than surface an error the user didn't cause. */
export class NotUndoableError extends Error {
  constructor(message = 'Action is not undoable') {
    super(message);
    this.name = 'NotUndoableError';
  }
}

/** Maximum stack depth. Older entries drop silently on overflow. */
export const UNDO_STACK_LIMIT = 50;

/** Internal stack frame — a label plus a paired forward/inverse. The
 *  forward and inverse are both zero-arg thunks; the original
 *  snapshot + forward result are baked in via closures so we can
 *  replay either direction without re-threading generics through
 *  the stack. */
interface StackFrame {
  label: string;
  /** Re-runs the original forward action. Called by `redo()`. */
  forward: () => Promise<void>;
  /** Runs the inverse against the state the forward produced.
   *  Called by `undo()`. */
  inverse: () => Promise<void>;
}

export interface UseUndoStackApi {
  /** Run `cmd.do()`. On success, push a redo-able frame; on failure,
   *  rethrow and leave stacks untouched. */
  execute<T, S>(cmd: UndoCommand<T, S>): Promise<T>;
  /** Pop the most recent command and run its inverse. */
  undo(): Promise<void>;
  /** Pop the most recent undone command and replay its forward. */
  redo(): Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  /** Label of the action `undo()` would reverse, if any. */
  nextUndoLabel: string | null;
  /** Label of the action `redo()` would replay, if any. */
  nextRedoLabel: string | null;
  /** Clear both stacks. Called automatically on modelId change. */
  clear(): void;
}

const UndoStackContext = createContext<UseUndoStackApi | null>(null);

/** Access the stack. Must be wrapped in `<UndoStackProvider>`. */
export function useUndoStack(): UseUndoStackApi {
  const ctx = useContext(UndoStackContext);
  if (!ctx) throw new Error('useUndoStack must be used within an UndoStackProvider');
  return ctx;
}

interface ProviderProps {
  modelId: string | undefined;
  children: ReactNode;
}

/** Build a stack frame from a command and its first execution result.
 *  Both the forward and inverse closures capture the freshest
 *  snapshot + result so a subsequent redo can bind a NEW result and
 *  rebuild the frame in turn. */
function buildFrame<T, S>(
  cmd: UndoCommand<T, S>,
  snapshot: S,
  result: T,
  onReplay: (cmd: UndoCommand<T, S>, snapshot: S, nextResult: T) => void,
): StackFrame {
  return {
    label: cmd.label,
    inverse: () => cmd.undo(snapshot, result),
    forward: async () => {
      // Replay produces a potentially-new result (e.g. a recreated
      // rel gets a new UUID). Rebuild the frame so its inverse
      // targets the new result.
      const nextResult = await cmd.do();
      onReplay(cmd, snapshot, nextResult);
    },
  };
}

export function UndoStackProvider({ modelId, children }: ProviderProps) {
  // Stacks live in refs so `execute` + `undo` + `redo` stay stable
  // across renders. Public counts mirror the refs into state so
  // consumer components (buttons, tooltips) re-render on change.
  const undoRef = useRef<StackFrame[]>([]);
  const redoRef = useRef<StackFrame[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const [nextUndoLabel, setNextUndoLabel] = useState<string | null>(null);
  const [nextRedoLabel, setNextRedoLabel] = useState<string | null>(null);
  const { toast } = useToast();

  const syncState = useCallback(() => {
    const u = undoRef.current;
    const r = redoRef.current;
    setUndoDepth(u.length);
    setRedoDepth(r.length);
    setNextUndoLabel(u.length > 0 ? (u[u.length - 1]?.label ?? null) : null);
    setNextRedoLabel(r.length > 0 ? (r[r.length - 1]?.label ?? null) : null);
  }, []);

  const clear = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    syncState();
  }, [syncState]);

  // Clear both stacks when modelId changes. Cross-model undo would
  // replay commands against a different model's state.
  useEffect(() => {
    clear();
  }, [modelId, clear]);

  const pushOnto = useCallback(
    (stack: StackFrame[], frame: StackFrame) => {
      stack.push(frame);
      if (stack.length > UNDO_STACK_LIMIT) {
        // Evict the oldest silently. `shift` is O(n) but n ≤ 50.
        stack.shift();
      }
      syncState();
    },
    [syncState],
  );

  const execute = useCallback(
    async function executeImpl<T, S>(cmd: UndoCommand<T, S>): Promise<T> {
      const snapshot = cmd.snapshot as S;
      // Run forward first — if it throws we push nothing. The hook
      // layer already toasts the failure (rels, attrs, notation).
      const result = await cmd.do();

      const onReplay = (c: UndoCommand<T, S>, s: S, nextResult: T) => {
        // After a redo, push a refreshed undo frame that targets the
        // fresh result (e.g. a new rel UUID after recreate).
        const nextFrame = buildFrame(c, s, nextResult, onReplay);
        pushOnto(undoRef.current, nextFrame);
      };

      pushOnto(undoRef.current, buildFrame(cmd, snapshot, result, onReplay));
      // Any new forward action invalidates the current redo trail.
      redoRef.current = [];
      syncState();
      return result;
    },
    [pushOnto, syncState],
  );

  const undo = useCallback(async () => {
    const frame = undoRef.current.pop();
    if (!frame) {
      syncState();
      return;
    }
    try {
      await frame.inverse();
    } catch (err) {
      if (err instanceof NotUndoableError) {
        // Intentional no-op: delete-entity clears the stack so the
        // next Cmd+Z doesn't resurrect an older action against an
        // inconsistent model.
        undoRef.current = [];
        redoRef.current = [];
        syncState();
        return;
      }
      // Server state has drifted. Can't trust subsequent undos.
      undoRef.current = [];
      redoRef.current = [];
      syncState();
      toast('Undo failed — server state changed', 'error');
      return;
    }
    // Successful undo: the SAME frame is now re-playable forward.
    // `frame.forward` will rebuild + push a fresh undo frame via
    // `onReplay`, so we don't have to thread state here.
    pushOnto(redoRef.current, frame);
  }, [pushOnto, syncState, toast]);

  const redo = useCallback(async () => {
    const frame = redoRef.current.pop();
    if (!frame) {
      syncState();
      return;
    }
    try {
      await frame.forward();
    } catch (err) {
      if (err instanceof NotUndoableError) {
        undoRef.current = [];
        redoRef.current = [];
        syncState();
        return;
      }
      undoRef.current = [];
      redoRef.current = [];
      syncState();
      toast('Redo failed — server state changed', 'error');
      return;
    }
    // `frame.forward` → `onReplay` already pushed a refreshed undo
    // frame. Nothing else to do.
    syncState();
  }, [syncState, toast]);

  const api = useMemo<UseUndoStackApi>(
    () => ({
      execute,
      undo,
      redo,
      canUndo: undoDepth > 0,
      canRedo: redoDepth > 0,
      nextUndoLabel,
      nextRedoLabel,
      clear,
    }),
    [execute, undo, redo, undoDepth, redoDepth, nextUndoLabel, nextRedoLabel, clear],
  );

  return createElement(UndoStackContext.Provider, { value: api }, children);
}
