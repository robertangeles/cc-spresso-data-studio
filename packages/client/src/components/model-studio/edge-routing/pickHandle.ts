/**
 * Phase 1 — dynamic handle picker.
 *
 * Given two entity bounding boxes, choose the cardinal source+target
 * handle pair so the edge exits each entity on the side FACING the
 * other entity. This eliminates the "line cuts through the entity
 * card" problem in the common (no-obstacle) case, which is ~60% of
 * the messy-line pathology before ELK obstacle avoidance lands in
 * Phase 2.
 *
 * Role-aware: returns ids that match EntityNode's handle definitions.
 * Source handles:  top-source, bottom, left-source, right-top
 * Target handles:  top, bottom-target, left, right-target
 *
 * Self-reference (same source & target entity) is handled by the
 * caller — `isSelfRef` short-circuits to right-top→right-bottom.
 */

export type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceHandleId = 'top-source' | 'bottom' | 'left-source' | 'right-top';
export type TargetHandleId = 'top' | 'bottom-target' | 'left' | 'right-target';

export type HandlePair = {
  sourceHandle: SourceHandleId;
  targetHandle: TargetHandleId;
};

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 200;

function centerOf(b: Partial<NodeBounds> & { x: number; y: number }): {
  cx: number;
  cy: number;
} {
  const width = b.width ?? DEFAULT_NODE_WIDTH;
  const height = b.height ?? DEFAULT_NODE_HEIGHT;
  return { cx: b.x + width / 2, cy: b.y + height / 2 };
}

export function pickHandle(
  source: Partial<NodeBounds> & { x: number; y: number },
  target: Partial<NodeBounds> & { x: number; y: number },
): HandlePair {
  const { cx: sx, cy: sy } = centerOf(source);
  const { cx: tx, cy: ty } = centerOf(target);
  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'right-top', targetHandle: 'left' }
      : { sourceHandle: 'left-source', targetHandle: 'right-target' };
  }
  return dy >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
}
