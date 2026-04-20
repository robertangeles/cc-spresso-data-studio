import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type Viewport,
} from '@xyflow/react';
import type { Layer } from '@cc/shared';
import { useCanvasState } from '../../hooks/useCanvasState';
import { useEntities, type EntitySummary } from '../../hooks/useEntities';
import { useAttributes, type SyntheticDataResult } from '../../hooks/useAttributes';
import { EntityNode, type EntityNodeData } from './EntityNode';
import { EntityEditor } from './EntityEditor';
import { SyntheticDataDrawer } from './SyntheticDataDrawer';
import '@xyflow/react/dist/style.css';

/**
 * Step 4 canvas — entities are now first-class citizens.
 *
 * Behaviour:
 *  - Loads entities for the current (model, layer).
 *  - Each entity renders as a custom EntityNode (with naming-lint
 *    underline + layer badge).
 *  - Double-click on empty canvas → creates a new entity at the cursor
 *    position. The entity opens in the detail panel focused on the
 *    name field so the user can rename immediately.
 *  - Single-click an entity → opens / re-uses the right-side detail
 *    panel for editing, auto-describe (D5), and cascade-aware delete.
 *  - Node positions persist via the existing canvas-state hook
 *    (debounced 500ms). Viewport persistence is unchanged from Step 3.
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

const NODE_TYPES = { entity: EntityNode };

// Always snake-safe so the physical-layer Zod check never blocks creation.
const DEFAULT_ENTITY_NAME = 'new_entity';

function InnerCanvas({ modelId, layer }: Props) {
  const canvas = useCanvasState(modelId, layer);
  const ent = useEntities(modelId);
  const attrs = useAttributes(modelId);
  const rf = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // D9 drawer state lives at the canvas level because the drawer
  // occupies the canvas viewport, not the panel.
  const [syntheticOpen, setSyntheticOpen] = useState(false);
  const [syntheticResult, setSyntheticResult] = useState<SyntheticDataResult | null>(null);
  const [syntheticLoading, setSyntheticLoading] = useState(false);
  const [syntheticError, setSyntheticError] = useState<string | null>(null);

  // Apply persisted viewport once loaded.
  useEffect(() => {
    if (canvas.isLoading) return;
    const v = canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 };
    rf.setViewport({ x: v.x, y: v.y, zoom: v.zoom });
  }, [canvas.isLoading, canvas.state.viewport, rf]);

  // Preload every entity's attributes in one batch call on canvas
  // mount so PKs render on nodes from first paint — no click required
  // (Step-5 follow-up #1/#3). The useAttributes hook keeps the map
  // fresh on subsequent mutations.
  const loadAllAttrs = attrs.loadAll;
  useEffect(() => {
    void loadAllAttrs();
  }, [loadAllAttrs]);

  // Build React Flow nodes from entities + persisted positions.
  const nodes: Node<EntityNodeData>[] = useMemo(() => {
    const visible = ent.entities.filter((e) => e.layer === layer);
    return visible.map((e) => {
      const pos = canvas.state.nodePositions[e.id] ?? { x: 0, y: 0 };
      const entityAttrs = attrs.attributesByEntity[e.id];
      return {
        id: e.id,
        type: 'entity',
        position: pos,
        selected: e.id === selectedId,
        data: {
          name: e.name,
          businessName: e.businessName,
          layer: e.layer,
          lint: e.lint,
          attributes: entityAttrs?.map((a) => ({
            id: a.id,
            name: a.name,
            dataType: a.dataType,
            isPrimaryKey: a.isPrimaryKey,
            ordinalPosition: a.ordinalPosition,
          })),
        },
      };
    });
  }, [ent.entities, layer, canvas.state.nodePositions, selectedId, attrs.attributesByEntity]);

  // Track local node movements and persist when the user releases.
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<EntityNodeData>>[]) => {
      const next = applyNodeChanges(changes, nodes);
      const nextPositions: Record<string, { x: number; y: number }> = {};
      for (const n of next) nextPositions[n.id] = { x: n.position.x, y: n.position.y };

      const hasMove = changes.some((c) => c.type === 'position');
      if (!hasMove) return;
      canvas.save({
        nodePositions: nextPositions,
        viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
      });
    },
    [canvas, nodes],
  );

  const handleMoveEnd = useCallback(
    (_e: unknown, v: Viewport) => {
      canvas.save({
        nodePositions: canvas.state.nodePositions,
        viewport: { x: v.x, y: v.y, zoom: v.zoom },
      });
    },
    [canvas],
  );

  // Double-click empty canvas → create entity at cursor (S4-E1).
  const handlePaneDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      const flowPos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      try {
        const created = await ent.create({
          name: DEFAULT_ENTITY_NAME,
          layer,
          entityType: 'standard',
        });
        canvas.save({
          nodePositions: { ...canvas.state.nodePositions, [created.id]: flowPos },
          viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
        });
        setSelectedId(created.id);
      } catch {
        // Errors surface via ent.error; nothing else to do here.
      }
    },
    [rf, ent, layer, canvas],
  );

  const handleNodeClick: NodeMouseHandler<Node<EntityNodeData>> = useCallback((_evt, node) => {
    setSelectedId(node.id);
  }, []);

  const selectedEntity: EntitySummary | null = useMemo(
    () => ent.entities.find((e) => e.id === selectedId) ?? null,
    [ent.entities, selectedId],
  );

  const updateSelected = useCallback(
    async (patch: { name?: string; businessName?: string | null; description?: string | null }) => {
      if (!selectedId) return;
      await ent.update(selectedId, patch);
    },
    [ent, selectedId],
  );

  const autoDescribeSelected = useCallback(async () => {
    if (!selectedId) return { description: '' };
    const r = await ent.autoDescribe(selectedId);
    return { description: r.description };
  }, [ent, selectedId]);

  const deleteSelected = useCallback(
    async (cascade: boolean) => {
      if (!selectedId) return;
      await ent.remove(selectedId, { cascade });
      // Drop the cached position so a recreated UUID never inherits it.
      const rest = { ...canvas.state.nodePositions };
      delete rest[selectedId];
      canvas.save({
        nodePositions: rest,
        viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
      });
      setSelectedId(null);
    },
    [ent, selectedId, canvas],
  );

  // --- Attribute handlers scoped to the currently-selected entity ---

  const attributeCreate = useCallback(
    (dto: Parameters<typeof attrs.create>[1]) => {
      if (!selectedId) return Promise.reject(new Error('No entity selected'));
      return attrs.create(selectedId, dto);
    },
    [attrs, selectedId],
  );

  const attributeUpdate = useCallback(
    (attrId: string, patch: Parameters<typeof attrs.update>[2]) => {
      if (!selectedId) return Promise.reject(new Error('No entity selected'));
      return attrs.update(selectedId, attrId, patch);
    },
    [attrs, selectedId],
  );

  const attributeDelete = useCallback(
    async (attrId: string) => {
      if (!selectedId) return;
      await attrs.remove(selectedId, attrId);
    },
    [attrs, selectedId],
  );

  const attributeReorder = useCallback(
    async (orderedIds: string[]) => {
      if (!selectedId) return;
      await attrs.reorder(selectedId, orderedIds);
    },
    [attrs, selectedId],
  );

  const generateSyntheticForSelected = useCallback(async () => {
    if (!selectedId) return;
    setSyntheticOpen(true);
    setSyntheticLoading(true);
    setSyntheticError(null);
    setSyntheticResult(null);
    try {
      const res = await attrs.generateSyntheticData(selectedId, 10);
      setSyntheticResult(res);
    } catch (e) {
      setSyntheticError(e instanceof Error ? e.message : 'Synthetic data generation failed');
    } finally {
      setSyntheticLoading(false);
    }
  }, [attrs, selectedId]);

  const empty = !canvas.isLoading && ent.entities.filter((e) => e.layer === layer).length === 0;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => setSelectedId(null)}
        onPaneContextMenu={(e) => e.preventDefault()}
        onDoubleClick={handlePaneDoubleClick}
        minZoom={0.1}
        maxZoom={3}
        onMoveEnd={handleMoveEnd}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        panOnScroll
        zoomOnScroll
        // Double-click is OUR create-entity gesture; turn off React Flow's
        // zoom-on-doubleclick or it eats the event before we see it.
        zoomOnDoubleClick={false}
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
          nodeColor={(n) => {
            const lyr = (n.data as EntityNodeData | undefined)?.layer;
            if (lyr === 'physical') return '#FCD34D';
            if (lyr === 'logical') return '#34D399';
            return '#60A5FA';
          }}
          nodeStrokeColor="rgba(255, 214, 10, 0.4)"
          className="!bg-surface-2/70 !backdrop-blur !border !border-white/10 !rounded-lg"
        />
      </ReactFlow>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          {/* No `pointer-events-auto` on the card — the entire empty
              state is a hint and must let the canvas receive the
              double-click that creates the first entity. */}
          <div className="max-w-md rounded-2xl border border-white/5 bg-surface-2/60 backdrop-blur-xl p-5 text-center shadow-[0_0_24px_rgba(255,214,10,0.12)]">
            <p className="text-sm font-medium text-text-primary">Empty {layer} layer</p>
            <p className="mt-1 text-xs text-text-secondary">
              Double-click anywhere on the canvas to drop your first entity. You can rename it,
              auto-describe it, and switch layers from the header.
            </p>
          </div>
        </div>
      )}

      <EntityEditor
        entity={selectedEntity}
        attributes={attrs.getFor(selectedId)}
        attributesBusy={attrs.isLoading}
        onClose={() => setSelectedId(null)}
        onUpdate={updateSelected}
        onAutoDescribe={autoDescribeSelected}
        onDelete={deleteSelected}
        onAttributeCreate={attributeCreate}
        onAttributeUpdate={attributeUpdate}
        onAttributeDelete={attributeDelete}
        onAttributeReorder={attributeReorder}
        onGenerateSynthetic={generateSyntheticForSelected}
        onLoadHistory={attrs.loadHistory}
      />

      <SyntheticDataDrawer
        open={syntheticOpen}
        entityName={selectedEntity?.name ?? null}
        result={syntheticResult}
        isLoading={syntheticLoading}
        error={syntheticError}
        panelOpen={selectedEntity !== null}
        onClose={() => setSyntheticOpen(false)}
        onRegenerate={generateSyntheticForSelected}
      />

      {(canvas.error || ent.error || attrs.error) && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-red-500/80 text-white text-[11px] px-2.5 py-1 shadow-lg">
          {canvas.error || ent.error || attrs.error}
        </div>
      )}
    </div>
  );
}
