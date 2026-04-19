import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NamingLintRule } from '@cc/shared';

/**
 * Custom React Flow node for a Model Studio entity.
 *
 * Visual rules (Infection Virus):
 *  - Glass card with backdrop blur, depth shadow on hover.
 *  - Selected → amber glow ring.
 *  - Naming-lint violation on the displayed name → amber underline
 *    + tooltip-style sub-label (handled in EntityDetailPanel; the node
 *    just shows the underline so the eye lands on it from the canvas).
 *
 * Layout: header with name, sub-label with businessName (or placeholder).
 * Edges connect via four anchors so future relationships have somewhere
 * to dock without re-laying out the node.
 */

/** Extends `Record<string, unknown>` so it satisfies React Flow v12's
 *  `Node<T extends Record<string, unknown>>` constraint. */
export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  businessName: string | null;
  layer: 'conceptual' | 'logical' | 'physical';
  lint: NamingLintRule[];
}

export interface EntityNodeProps extends NodeProps {
  data: EntityNodeData;
}

const LAYER_BADGE: Record<EntityNodeData['layer'], { label: string; tone: string }> = {
  conceptual: { label: 'C', tone: 'bg-blue-500/30 text-blue-200 border-blue-400/40' },
  logical: { label: 'L', tone: 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40' },
  physical: { label: 'P', tone: 'bg-amber-500/30 text-amber-200 border-amber-400/40' },
};

function EntityNodeComponent({ data, selected }: EntityNodeProps) {
  const violation = data.lint.find((l) => l.severity === 'violation');
  const badge = LAYER_BADGE[data.layer];

  return (
    <div
      data-testid="entity-node"
      className={[
        'min-w-[180px] max-w-[260px] rounded-xl border backdrop-blur-xl transition-all duration-150 ease-out',
        'bg-surface-2/70 border-white/10 shadow-[0_4px_18px_rgba(0,0,0,0.35)]',
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
        selected
          ? 'ring-2 ring-accent shadow-[0_0_18px_rgba(255,214,10,0.35)] border-accent/40'
          : '',
      ].join(' ')}
    >
      {/* Hidden anchors for future relationship edges */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${badge.tone}`}
          title={`${data.layer} layer`}
          aria-label={`${data.layer} layer`}
        >
          {badge.label}
        </span>
        <span
          className={[
            'truncate text-sm font-semibold text-text-primary',
            violation ? 'underline decoration-amber-400 decoration-wavy underline-offset-4' : '',
          ].join(' ')}
          title={violation?.message}
        >
          {data.name || 'untitled'}
        </span>
      </div>
      {data.businessName ? (
        <div className="px-3 pb-2 text-xs text-text-secondary truncate" title={data.businessName}>
          {data.businessName}
        </div>
      ) : (
        <div className="px-3 pb-2 text-xs text-text-secondary/50 italic">no business name</div>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
