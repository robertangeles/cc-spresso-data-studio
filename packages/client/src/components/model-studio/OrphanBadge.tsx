/**
 * Step 6 — D-R5 orphan-entity amber-dot badge.
 *
 * Rendered absolutely-positioned on top of an EntityNode's top-right
 * corner when the entity has zero relationships. Toggle preference
 * lives on `canvas_states.metadata.showOrphanBadges` and is broadcast
 * via `useBroadcastCanvas` so peer tabs stay in sync.
 *
 * No hooks inside the component — pure visual so EntityNode can mount
 * it cheaply for every node without adding state to each.
 */

export interface OrphanBadgeProps {
  entityId: string;
  relCount: number;
}

export function OrphanBadge({ entityId, relCount }: OrphanBadgeProps) {
  if (relCount !== 0) return null;
  return (
    <span
      data-testid="orphan-badge"
      data-entity-id={entityId}
      title="Orphan entity — not connected to any relationships"
      aria-label="Orphan entity"
      className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_rgba(255,214,10,0.6)] ring-2 ring-surface-2"
    />
  );
}
