import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Viewport,
} from '@xyflow/react';
import type { Layer } from '@cc/shared';
import { useCanvasState } from '../../hooks/useCanvasState';
import '@xyflow/react/dist/style.css';

/**
 * Step 3 canvas foundation.
 *
 *  - Empty React Flow v12 canvas (pan + zoom + scroll zoom).
 *  - Controls: zoom in/out, fit-view, interactive toggle.
 *  - Minimap (D7) — layer-colour-aware stub: nodes are absent at Step 3
 *    so the minimap mostly shows the viewport frame. Colour scheme
 *    kicks in when entities land (Step 4).
 *  - Persistence: useCanvasState loads on mount, saves on viewport
 *    change (500 ms debounce). Node positions will be added to the
 *    save path in Step 4 once nodes exist.
 *
 * Rob's mental model for "Canvas is Step 3":
 *  At Step 3 complete the user sees a pannable/zoomable canvas with a
 *  visible grid, controls in the corner, and a minimap. The "your
 *  model is saved" message stays as a centred overlay nudging the
 *  user toward Step 4 (entities).
 */

interface Props {
  modelId: string;
  layer: Layer;
}

export function ModelStudioCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <InnerCanvas {...props} />
    </ReactFlowProvider>
  );
}

function InnerCanvas({ modelId, layer }: Props) {
  const { state, isLoading, error, save } = useCanvasState(modelId, layer);
  const rf = useReactFlow();

  // Apply persisted viewport once loaded.
  useEffect(() => {
    if (isLoading) return;
    const v = state.viewport ?? { x: 0, y: 0, zoom: 1 };
    rf.setViewport({ x: v.x, y: v.y, zoom: v.zoom });
  }, [isLoading, state.viewport, rf]);

  // Persist viewport when the user finishes panning/zooming.
  // React Flow v12 calls this `onMoveEnd`; the handler receives the
  // originating event + the final Viewport.
  const handleMoveEnd = useCallback(
    (_e: unknown, v: Viewport) => {
      save({
        nodePositions: state.nodePositions,
        viewport: { x: v.x, y: v.y, zoom: v.zoom },
      });
    },
    [save, state.nodePositions],
  );

  // No nodes yet at Step 3 — Step 4 wires entities through.
  const nodes = useMemo(() => [], []);
  const edges = useMemo(() => [], []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        minZoom={0.1}
        maxZoom={3}
        onMoveEnd={handleMoveEnd}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        panOnScroll
        zoomOnScroll
        selectionOnDrag
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255, 214, 10, 0.10)"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!bg-surface-2/70 !backdrop-blur !border !border-white/10 !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-text-secondary hover:[&>button]:!text-accent"
        />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Canvas minimap"
          position="bottom-left"
          maskColor="rgba(0, 0, 0, 0.6)"
          nodeColor="#FFD60A"
          nodeStrokeColor="rgba(255, 214, 10, 0.4)"
          className="!bg-surface-2/70 !backdrop-blur !border !border-white/10 !rounded-lg"
        />
      </ReactFlow>

      {/* Step-3 nudge overlay — shows until the model has nodes. */}
      {!isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="pointer-events-auto max-w-md rounded-2xl border border-white/5 bg-surface-2/60 backdrop-blur-xl p-5 text-center shadow-[0_0_24px_rgba(255,214,10,0.12)]">
            <p className="text-sm font-medium text-text-primary">Canvas is live</p>
            <p className="mt-1 text-xs text-text-secondary">
              Pan with the mouse, zoom with scroll, and the viewport you leave here will be restored
              on reload.
              <br />
              Adding entities unlocks in Step 4.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-red-500/80 text-white text-[11px] px-2.5 py-1 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
