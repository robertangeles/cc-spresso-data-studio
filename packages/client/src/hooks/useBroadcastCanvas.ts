import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Step 6 — generalised BroadcastChannel sync for `canvas_states`.
 *
 * Decision 7B (alignment-step6.md): the per-user canvas state (notation,
 * viewport, layer, selection, orphan-badge toggle) must sync across
 * tabs open on the same model. Rather than one channel per field, we
 * open a single channel per model and route messages by `field`.
 *
 * Contract:
 *   - Channel name: `model-studio:canvas:${modelId}`.
 *   - Each hook instance tags outbound messages with a `clientId` so
 *     subscribers can drop their own echoes (BroadcastChannel delivers
 *     to every OTHER document by default — but being defensive here
 *     avoids surprises under Jest/JSDOM polyfills that may echo).
 *   - `BroadcastChannel` is feature-detected. When absent (older Safari,
 *     older Edge, some test polyfills), publish/subscribe become no-ops
 *     so the caller logic stays identical.
 *   - The channel closes on unmount — no lingering listeners.
 *
 * This hook is intentionally dumb: it does not touch localStorage, the
 * server, or any domain state. `useNotation` (and any later hooks that
 * sync viewport or selection) layer their persistence semantics on top.
 */

export type CanvasStateField =
  | 'notation'
  | 'layer'
  | 'viewport'
  | 'selectedEntityId'
  | 'selectedRelId'
  | 'showOrphanBadges';

export interface CanvasBroadcastMessage<K extends CanvasStateField = CanvasStateField> {
  field: K;
  /** Narrowed per-field at the call site. */
  value: unknown;
  /** Dedupe own messages. */
  clientId: string;
  timestamp: number;
}

export interface UseBroadcastCanvasApi {
  publish(field: CanvasStateField, value: unknown): void;
  subscribe(field: CanvasStateField, handler: (value: unknown) => void): () => void;
}

/** Safe wrapper around `crypto.randomUUID()` for envs that lack it
 *  (older jsdom). Not secure — only used as a message-origin dedupe
 *  tag, not for anything sensitive. */
function stableClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Feature-detect `BroadcastChannel`. We guard `typeof` before referencing
 *  the constructor to avoid ReferenceError in SSR or older runtimes. */
function hasBroadcastChannel(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.BroadcastChannel === 'function';
}

/** Narrow an unknown message event payload to our known shape. */
function isCanvasMessage(v: unknown): v is CanvasBroadcastMessage {
  if (v === null || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.field === 'string' && typeof m.clientId === 'string' && typeof m.timestamp === 'number'
  );
}

export function useBroadcastCanvas(modelId: string | undefined): UseBroadcastCanvasApi {
  // One clientId per hook instance — survives re-renders, regenerated
  // only on remount (which is what we want: a re-mounted component is
  // logically a new tab for dedupe purposes).
  const clientIdRef = useRef<string>();
  if (!clientIdRef.current) clientIdRef.current = stableClientId();

  const channelRef = useRef<BroadcastChannel | null>(null);
  // field → set of handlers. Shared across all subscriptions so one
  // `message` listener fans out to every subscriber for that field.
  const handlersRef = useRef<Map<CanvasStateField, Set<(value: unknown) => void>>>(new Map());

  useEffect(() => {
    if (!modelId || !hasBroadcastChannel()) {
      channelRef.current = null;
      return;
    }
    const channel = new BroadcastChannel(`model-studio:canvas:${modelId}`);
    channelRef.current = channel;

    const onMessage = (ev: MessageEvent) => {
      const payload = ev.data;
      if (!isCanvasMessage(payload)) return;
      // Drop own echoes so `publish` never re-fires my own handler.
      if (payload.clientId === clientIdRef.current) return;
      const set = handlersRef.current.get(payload.field);
      if (!set || set.size === 0) return;
      // Snapshot the set so a handler that unsubscribes mid-iteration
      // doesn't mutate what we're iterating.
      for (const h of Array.from(set)) {
        h(payload.value);
      }
    };

    channel.addEventListener('message', onMessage);

    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [modelId]);

  const publish = useCallback((field: CanvasStateField, value: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    const msg: CanvasBroadcastMessage = {
      field,
      value,
      clientId: clientIdRef.current ?? 'unknown',
      timestamp: Date.now(),
    };
    channel.postMessage(msg);
  }, []);

  const subscribe = useCallback((field: CanvasStateField, handler: (value: unknown) => void) => {
    const map = handlersRef.current;
    let set = map.get(field);
    if (!set) {
      set = new Set();
      map.set(field, set);
    }
    set.add(handler);
    return () => {
      const current = map.get(field);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) map.delete(field);
    };
  }, []);

  return useMemo(() => ({ publish, subscribe }), [publish, subscribe]);
}
