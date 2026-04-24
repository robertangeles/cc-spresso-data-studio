import { useCallback, useRef, useState } from 'react';
import { useToast } from '../components/ui/Toast';

/**
 * Step 6 — 4A: FK ↔ Relationship bidirectional non-blocking toasts.
 *
 * Contract (alignment-step6.md §1 decision 4A):
 *   - When a modeller flags an attribute `is_foreign_key = true` and a
 *     plausible target can be inferred, fire a toast offering to create
 *     a relationship. The modeller must confirm via ⌘↵ — we NEVER auto-
 *     write the rel.
 *   - When a rel is deleted, fire a toast asking whether to also clear
 *     the FK flag on the attribute that backed it. Also confirm-only.
 *
 * This hook owns the pending-toast queue + the confirm callbacks. The
 * actual toast surface uses the existing `useToast` primitive (the
 * codebase already ships `components/ui/Toast.tsx` — no `sonner`).
 *
 * Because `useToast` is a simple string-based API with no "action"
 * button slot, we additionally expose a `pendingConfirms[]` state the
 * Phase-5 canvas chrome can render as its own action toast UI (with a
 * "⌘↵" button). The base `toast()` call is fired too so the user sees
 * SOMETHING even before Phase 5 lands.
 *
 * IMPORTANT INVARIANT: this hook never mutates attributes or rels
 * itself. Confirm callbacks are passed through untouched.
 */

export type FkToRelSuggestion = {
  kind: 'fk-to-rel';
  attrId: string;
  attrName: string;
  sourceEntityId: string;
  sourceEntityName: string;
  inferredTargetEntityId: string;
  inferredTargetEntityName: string;
  confirm: () => Promise<void> | void;
};

export type RelToFkSuggestion = {
  kind: 'rel-to-fk';
  relId: string;
  attrId: string;
  attrName: string;
  entityId: string;
  entityName: string;
  confirm: () => Promise<void> | void;
};

export type PendingSuggestion = (FkToRelSuggestion | RelToFkSuggestion) & {
  /** Generated here so the Phase-5 UI can use it as a React key. */
  id: string;
};

export interface UseRelationshipSyncBridgeApi {
  /** Read-only snapshot of pending suggestions for the UI to render. */
  pendingSuggestions: PendingSuggestion[];
  /** Fire when an attribute is saved with `isForeignKey = true` and a
   *  target entity can be inferred. Shows a toast and adds to pending. */
  suggestFkToRel(input: Omit<FkToRelSuggestion, 'kind'>): void;
  /** Fire after a relationship is deleted and its source-side FK attr
   *  is still flagged `isForeignKey = true`. */
  suggestRelToFk(input: Omit<RelToFkSuggestion, 'kind'>): void;
  /** Dismiss a pending suggestion without confirming. */
  dismiss(id: string): void;
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useRelationshipSyncBridge(): UseRelationshipSyncBridgeApi {
  const [pendingSuggestions, setPending] = useState<PendingSuggestion[]>([]);
  // Track the ids we've already added to prevent the same event firing
  // twice from React's dev-mode double-invoke. Cheap set-based dedupe
  // keyed on (kind, attrId | relId).
  const seenRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  const suggestFkToRel = useCallback(
    (input: Omit<FkToRelSuggestion, 'kind'>) => {
      const key = `fk:${input.attrId}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      const id = nextId();
      const suggestion: PendingSuggestion = { ...input, kind: 'fk-to-rel', id };
      setPending((prev) => [...prev, suggestion]);
      toast(`Create relationship to ${input.inferredTargetEntityName}? \u2318\u21B5`, 'info');
    },
    [toast],
  );

  const suggestRelToFk = useCallback(
    (input: Omit<RelToFkSuggestion, 'kind'>) => {
      const key = `rel:${input.relId}:${input.attrId}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      const id = nextId();
      const suggestion: PendingSuggestion = { ...input, kind: 'rel-to-fk', id };
      setPending((prev) => [...prev, suggestion]);
      toast(`Also clear FK flag on ${input.entityName}.${input.attrName}? \u2318\u21B5`, 'info');
    },
    [toast],
  );

  const dismiss = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { pendingSuggestions, suggestFkToRel, suggestRelToFk, dismiss };
}
