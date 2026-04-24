import { useCallback, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

/**
 * Step 6 — D-R6 "Tidy" canvas button.
 *
 * Wraps `@dagrejs/dagre` (v3) auto-layout:
 *   - Left→right rank direction (mirrors how modellers read ER
 *     diagrams).
 *   - 40 px `nodesep`, 80 px `ranksep` — tuned so entities with 5–8
 *     attributes don't collide without forcing enormous gaps.
 *
 * Keyboard shortcut: ⌘+Shift+T / Ctrl+Shift+T. The shortcut is wired
 * here rather than at the canvas level so wherever the button mounts
 * owns the hotkey.
 */

export interface TidyButtonProps {
  /** Current nodes — passed through dagre. */
  nodes: Node[];
  /** Current edges — dagre uses them for rank-ordering. */
  edges: Edge[];
  /** Commit updated positions back to React Flow. */
  onLayout: (next: Node[]) => void;
}

/** Default node-dim fallback for dagre. Real React Flow nodes report
 *  measured width/height after mount; until then we give dagre a
 *  reasonable box so the graph doesn't collapse to (1,1). */
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 120;

export function runDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });

  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.width ?? n.measured?.width ?? DEFAULT_WIDTH,
      height: n.height ?? n.measured?.height ?? DEFAULT_HEIGHT,
    });
  }
  for (const e of edges) {
    if (e.source === e.target) continue; // self-ref — dagre chokes on cycles of 1
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const w = n.width ?? n.measured?.width ?? DEFAULT_WIDTH;
    const h = n.height ?? n.measured?.height ?? DEFAULT_HEIGHT;
    return {
      ...n,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });
}

export function TidyButton({ nodes, edges, onLayout }: TidyButtonProps) {
  const tidy = useCallback(() => {
    const next = runDagreLayout(nodes, edges);
    onLayout(next);
  }, [nodes, edges, onLayout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        tidy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tidy]);

  return (
    <button
      type="button"
      data-testid="tidy-button"
      onClick={tidy}
      title="Auto-layout the canvas (⌘Shift+T)"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-xl transition-all hover:border-accent/30 hover:text-accent hover:shadow-[0_0_12px_rgba(255,214,10,0.15)]"
    >
      <Wand2 className="h-3.5 w-3.5" />
      Tidy
      <kbd className="ml-1 rounded border border-white/10 bg-surface-1/60 px-1 text-[9px] font-mono text-text-secondary/70">
        ⌘⇧T
      </kbd>
    </button>
  );
}
