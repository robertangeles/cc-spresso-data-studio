import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type Viewport,
} from '@xyflow/react';
import type { Cardinality, CreateRelationshipInput, Layer, Relationship } from '@cc/shared';
import { Sparkles } from 'lucide-react';
import { useCanvasState } from '../../hooks/useCanvasState';
import { useEntities, type EntitySummary } from '../../hooks/useEntities';
import { useAttributes, type SyntheticDataResult } from '../../hooks/useAttributes';
import { isVersionConflictResult, useRelationships } from '../../hooks/useRelationships';
import { useRelationshipSyncBridge } from '../../hooks/useRelationshipSyncBridge';
import { useBroadcastCanvas } from '../../hooks/useBroadcastCanvas';
import { useToast } from '../ui/Toast';
import { EntityNode, type EntityNodeData } from './EntityNode';
import { EntityEditor } from './EntityEditor';
import { SyntheticDataDrawer } from './SyntheticDataDrawer';
import { RelationshipEdge, type RelationshipEdgeData } from './RelationshipEdge';
import { RelationshipPanel } from './RelationshipPanel';
import { CascadeDeleteDialog } from './CascadeDeleteDialog';
import { InferRelationshipsPanel } from './InferRelationshipsPanel';
import { EdgeContextMenu } from './EdgeContextMenu';
import { NotationSwitcher } from './NotationSwitcher';
import { TidyButton } from './TidyButton';
import { useNotation } from '../../hooks/useNotation';
import { UndoStackProvider, useUndoStack, NotUndoableError } from '../../hooks/useUndoStack';
import { UndoRedoButtons } from './UndoRedoButtons';
import type { AuditEvent } from '../../lib/auditFormatter';
import '@xyflow/react/dist/style.css';

/**
 * Step 4 canvas — entities are first-class citizens; Step 6 adds
 * relationships + notation toggle + inference + auto-layout + cascade
 * delete. The orchestration here is intentionally wide: lots of
 * hooks, but no domain logic — every rule lives in its hook or child.
 */

interface Props {
  modelId: string;
  layer: Layer;
}

export function ModelStudioCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <UndoStackProvider modelId={props.modelId}>
        <InnerCanvas {...props} />
      </UndoStackProvider>
    </ReactFlowProvider>
  );
}

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = { relationship: RelationshipEdge };

const DEFAULT_ENTITY_NAME = 'new_entity';

function InnerCanvas({ modelId, layer }: Props) {
  const canvas = useCanvasState(modelId, layer);
  const ent = useEntities(modelId);
  const attrs = useAttributes(modelId);
  const rels = useRelationships(modelId);
  const { notation } = useNotation(modelId, layer);
  const { publish, subscribe } = useBroadcastCanvas(modelId);
  const bridge = useRelationshipSyncBridge();
  const { toast } = useToast();
  const rf = useReactFlow();
  const undo = useUndoStack();

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [newlyCreatedRelId, setNewlyCreatedRelId] = useState<string | null>(null);
  const [showOrphanBadges, setShowOrphanBadges] = useState(true);
  const [inferOpen, setInferOpen] = useState(false);
  const [cascadeEntityId, setCascadeEntityId] = useState<string | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ rel: Relationship; x: number; y: number } | null>(
    null,
  );

  // D9 synthetic-data drawer state.
  const [syntheticOpen, setSyntheticOpen] = useState(false);
  const [syntheticResult, setSyntheticResult] = useState<SyntheticDataResult | null>(null);
  const [syntheticLoading, setSyntheticLoading] = useState(false);
  const [syntheticError, setSyntheticError] = useState<string | null>(null);

  // Rel-scoped audit events for the panel (parent-fetched to avoid
  // panel re-fetches on every re-open). MVP: empty array — the Audit
  // tab degrades to a "no events" state until Phase 6 wires a proper
  // loader. No regression against Phase 4.
  const [relAuditEvents] = useState<AuditEvent[]>([]);

  // Fetch rels once per model + layer.
  const loadAllRels = rels.loadAll;
  useEffect(() => {
    void loadAllRels();
  }, [loadAllRels]);

  // Broadcast: peer tabs toggle orphan-badge visibility in-sync.
  useEffect(() => {
    const unsubscribe = subscribe('showOrphanBadges', (value: unknown) => {
      if (typeof value === 'boolean') setShowOrphanBadges(value);
    });
    return unsubscribe;
  }, [subscribe]);

  // Apply persisted viewport once loaded.
  useEffect(() => {
    if (canvas.isLoading) return;
    const v = canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 };
    rf.setViewport({ x: v.x, y: v.y, zoom: v.zoom });
  }, [canvas.isLoading, canvas.state.viewport, rf]);

  // Preload attributes on mount so PKs + FKs render before click.
  const loadAllAttrs = attrs.loadAll;
  useEffect(() => {
    void loadAllAttrs();
  }, [loadAllAttrs]);

  // Edge context-menu trigger (from RelationshipEdge's onContextMenu).
  useEffect(() => {
    const onCtx = (evt: Event) => {
      const ce = evt as CustomEvent<{ relId: string; x: number; y: number }>;
      const rel = rels.relationships.find((r) => r.id === ce.detail.relId);
      if (!rel) return;
      setEdgeMenu({ rel, x: ce.detail.x, y: ce.detail.y });
    };
    window.addEventListener('rel:context-menu', onCtx as EventListener);
    return () => window.removeEventListener('rel:context-menu', onCtx as EventListener);
  }, [rels.relationships]);

  // Count rels per entity for the orphan badge.
  const relCountByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rels.relationships) {
      m.set(r.sourceEntityId, (m.get(r.sourceEntityId) ?? 0) + 1);
      if (r.targetEntityId !== r.sourceEntityId) {
        m.set(r.targetEntityId, (m.get(r.targetEntityId) ?? 0) + 1);
      }
    }
    return m;
  }, [rels.relationships]);

  // "Structural" nodes — identity + data shape derived purely from
  // external state (entities, attributes, selection, orphan badges).
  // CRITICAL: `canvas.state.nodePositions` is intentionally NOT in this
  // dep list. Positions flow through React Flow's own `useNodesState`
  // via the sync effect below, and are seeded once on initial load via
  // `hasSeededPositions`. Including positions here causes every
  // `canvas.save` (drag-end, viewport pan) to re-seed node identities,
  // which makes React Flow re-measure mid-gesture and produces the
  // scroll/pan bouncing jank reported after commit 7801bc5.
  const structuralNodes: Node<EntityNodeData>[] = useMemo(() => {
    const visible = ent.entities.filter((e) => e.layer === layer);
    return visible.map((e) => {
      const entityAttrs = attrs.attributesByEntity[e.id];
      return {
        id: e.id,
        type: 'entity',
        // Placeholder — real position is patched in by the sync effect
        // below (live drag state) or the one-time seed effect (persisted
        // canvas state). Never trust this value.
        position: { x: 0, y: 0 },
        selected: e.id === selectedEntityId,
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
          relCount: relCountByEntity.get(e.id) ?? 0,
          showOrphanBadge: showOrphanBadges,
        },
      };
    });
  }, [
    ent.entities,
    layer,
    selectedEntityId,
    attrs.attributesByEntity,
    relCountByEntity,
    showOrphanBadges,
  ]);

  // React Flow v12 node state. Owning node identity here fixes the
  // "trying to drag a node that is not initialized" warning that
  // appears when `nodes` is recomputed via useMemo on every external
  // state change.
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<Node<EntityNodeData>>([]);

  // Sync structural identity → local. Position precedence:
  //   1. live drag position already held by React Flow (`existing`)
  //   2. persisted canvas position (first render before seed effect has run)
  //   3. (0,0) fallback
  // We do not re-seed from `canvas.state.nodePositions` here on every
  // save — that causes the pan/drag bounce. Positions are owned by
  // React Flow from this point on; canvas saves are one-way.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return structuralNodes.map((s) => {
        const existing = prevById.get(s.id);
        const persistedPos = canvas.state.nodePositions[s.id];
        const position = existing?.position ?? persistedPos ?? { x: 0, y: 0 };
        return { ...s, position };
      });
    });
    // Positions flow through useNodesState — do NOT add
    // `canvas.state.nodePositions` to this dep list. See comment on
    // `structuralNodes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralNodes, setNodes]);

  // One-time positional seed: when canvas.isLoading transitions to false,
  // patch persisted positions into React Flow's internal state once.
  // Subsequent `canvas.save` calls (drag-end, tidy-layout, new-entity)
  // update `canvas.state.nodePositions` but do NOT re-seed here — those
  // positions already live in React Flow's state from the interaction
  // that produced them.
  const hasSeededPositions = useRef(false);
  useEffect(() => {
    if (canvas.isLoading) return;
    if (hasSeededPositions.current) return;
    hasSeededPositions.current = true;
    setNodes((prev) =>
      prev.map((n) => {
        const pos = canvas.state.nodePositions[n.id];
        return pos ? { ...n, position: pos } : n;
      }),
    );
  }, [canvas.isLoading, canvas.state.nodePositions, setNodes]);

  // Edges.
  //
  // Self-ref routing (#6 follow-up v2): EntityNode's entity-level
  // handles now carry stable `id`s with strict source/target roles:
  //   - top    (target)
  //   - bottom (source)
  //   - left   (target)
  //   - right  (source)
  // For a self-ref edge we must connect a SOURCE handle to a TARGET
  // handle — React Flow silently drops the edge otherwise (source→
  // source or target→target is invalid). We route `right` (source) →
  // `top` (target) so React Flow resolves distinct endpoint coords
  // on the same node; `selfRefPath` then draws a visible arc between
  // them. zIndex 1000 keeps the arc in front of the entity card.
  const edges: Edge<RelationshipEdgeData>[] = useMemo(() => {
    return rels.relationships
      .filter((r) => r.layer === layer)
      .map((r) => {
        const selfRef = r.sourceEntityId === r.targetEntityId;
        return {
          id: r.id,
          source: r.sourceEntityId,
          target: r.targetEntityId,
          type: 'relationship',
          selected: r.id === selectedRelId,
          ...(selfRef ? { zIndex: 1000, sourceHandle: 'right', targetHandle: 'top' } : {}),
          data: {
            sourceCardinality: r.sourceCardinality,
            targetCardinality: r.targetCardinality,
            isIdentifying: r.isIdentifying,
            notation,
            isSelfRef: selfRef,
            isNewlyCreated: r.id === newlyCreatedRelId,
            sourceEntityId: r.sourceEntityId,
            targetEntityId: r.targetEntityId,
            relId: r.id,
            ...(r.name ? { name: r.name } : {}),
          },
        };
      });
  }, [rels.relationships, layer, selectedRelId, notation, newlyCreatedRelId]);

  // Clear the shimmer flag after the animation window closes.
  useEffect(() => {
    if (!newlyCreatedRelId) return;
    const t = setTimeout(() => setNewlyCreatedRelId(null), 1600);
    return () => clearTimeout(t);
  }, [newlyCreatedRelId]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<EntityNodeData>>[]) => {
      // Let React Flow own the live drag state (fixes "not initialized" warning).
      onNodesChangeInternal(changes);

      // Persist positions only on drag END (not during every mouse-move).
      // React Flow emits `{type:'position', dragging:false}` once per drag gesture
      // when the user releases the mouse; intermediate changes have `dragging:true`.
      const dragEndChanges = changes.filter((c) => c.type === 'position' && c.dragging === false);
      if (dragEndChanges.length === 0) return;

      const next = applyNodeChanges(changes, nodes);
      const nextPositions: Record<string, { x: number; y: number }> = {};
      for (const n of next) nextPositions[n.id] = { x: n.position.x, y: n.position.y };
      const previousPositions = { ...canvas.state.nodePositions };
      const viewport = canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 };
      // Undo-wrapped: capture the pre-drag position map so Cmd+Z
      // snaps nodes back where they started. `canvas.save` is
      // optimistic + local, so replaying it on undo/redo produces
      // the expected visible motion.
      void undo.execute({
        label: 'Move entity',
        do: async () => {
          canvas.save({ nodePositions: nextPositions, viewport });
        },
        undo: async () => {
          canvas.save({ nodePositions: previousPositions, viewport });
        },
      });
    },
    [canvas, nodes, onNodesChangeInternal, undo],
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

  const handlePaneDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      const flowPos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      try {
        const created = await undo.execute({
          label: 'Create entity',
          do: async () => {
            const e = await ent.create({
              name: DEFAULT_ENTITY_NAME,
              layer,
              entityType: 'standard',
            });
            canvas.save({
              nodePositions: { ...canvas.state.nodePositions, [e.id]: flowPos },
              viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
            });
            return e;
          },
          undo: async (_snap, createdEntity) => {
            // Entity create IS undoable because we own the cascade
            // context (no attrs + no rels yet at creation time).
            await ent.remove(createdEntity.id, { cascade: true });
            const rest = { ...canvas.state.nodePositions };
            delete rest[createdEntity.id];
            canvas.save({
              nodePositions: rest,
              viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
            });
          },
        });
        setSelectedEntityId(created.id);
      } catch {
        /* errors surface via ent.error */
      }
    },
    [rf, ent, layer, canvas, undo],
  );

  const handleNodeClick: NodeMouseHandler<Node<EntityNodeData>> = useCallback((_evt, node) => {
    setSelectedEntityId(node.id);
    setSelectedRelId(null);
  }, []);

  const handleEdgeClick: EdgeMouseHandler = useCallback((_evt, edge) => {
    setSelectedRelId(edge.id);
    setSelectedEntityId(null);
  }, []);

  /** React Flow handle ids follow the contract `attr-{uuid}-{source|target}`.
   *  Return the bare entity id regardless of whether the modeller
   *  dragged from an attribute row or the entity card itself. */
  const resolveEntityId = useCallback((handleOwnerId: string): string => handleOwnerId, []);

  // Connect: a drag from one handle to another lands here.
  const handleConnect = useCallback(
    async (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const src = resolveEntityId(conn.source);
      const tgt = resolveEntityId(conn.target);

      // S6-E4 — duplicate drag opens the existing rel panel instead of
      // trying to create a zombie.
      const existing = rels.relationships.find(
        (r) => r.sourceEntityId === src && r.targetEntityId === tgt,
      );
      if (existing) {
        setSelectedRelId(existing.id);
        toast('Relationship already exists — opening panel', 'info');
        return;
      }

      const payload: CreateRelationshipInput = {
        sourceEntityId: src,
        targetEntityId: tgt,
        name: null,
        sourceCardinality: 'one',
        targetCardinality: 'many',
        isIdentifying: false,
        layer,
      };
      try {
        const created = await undo.execute({
          label: 'Create relationship',
          do: () => rels.create(payload),
          undo: async (_snap, rel) => {
            await rels.remove(rel.id);
          },
        });
        setNewlyCreatedRelId(created.id);
      } catch {
        /* handled by useRelationships toast */
      }
    },
    [rels, layer, toast, resolveEntityId, undo],
  );

  const handleEdgeContextMenu: EdgeMouseHandler = useCallback(
    (evt, edge) => {
      evt.preventDefault();
      const rel = rels.relationships.find((r) => r.id === edge.id);
      if (!rel) return;
      setEdgeMenu({
        rel,
        x: (evt as unknown as MouseEvent).clientX,
        y: (evt as unknown as MouseEvent).clientY,
      });
    },
    [rels.relationships],
  );

  // Intercept entity deletes so we can show the cascade dialog.
  const handleNodesDelete = useCallback((deleted: Node[]) => {
    const first = deleted[0];
    if (!first) return;
    setCascadeEntityId(first.id);
  }, []);

  const selectedEntity: EntitySummary | null = useMemo(
    () => ent.entities.find((e) => e.id === selectedEntityId) ?? null,
    [ent.entities, selectedEntityId],
  );

  const selectedRel: Relationship | null = useMemo(
    () => rels.relationships.find((r) => r.id === selectedRelId) ?? null,
    [rels.relationships, selectedRelId],
  );

  // Entity mutations (unchanged from Step 4/5).
  const updateSelected = useCallback(
    async (patch: { name?: string; businessName?: string | null; description?: string | null }) => {
      if (!selectedEntityId) return;
      // Snapshot the current entity so we can revert field-by-field.
      const current = ent.entities.find((e) => e.id === selectedEntityId);
      if (!current) return;
      const inversePatch: {
        name?: string;
        businessName?: string | null;
        description?: string | null;
      } = {};
      if (patch.name !== undefined) inversePatch.name = current.name;
      if (patch.businessName !== undefined) inversePatch.businessName = current.businessName;
      if (patch.description !== undefined) inversePatch.description = current.description;
      await undo.execute({
        label: 'Update entity',
        do: () => ent.update(selectedEntityId, patch),
        undo: async () => {
          await ent.update(selectedEntityId, inversePatch);
        },
      });
    },
    [ent, selectedEntityId, undo],
  );

  const autoDescribeSelected = useCallback(async () => {
    if (!selectedEntityId) return { description: '' };
    const r = await ent.autoDescribe(selectedEntityId);
    return { description: r.description };
  }, [ent, selectedEntityId]);

  const deleteSelected = useCallback(
    async (cascade: boolean) => {
      if (!selectedEntityId) return;
      // Entity delete routes through the stack with a NotUndoableError
      // so Cmd+Z clears the stack (can't undo older actions against
      // an inconsistent model after a cascading delete). See
      // alignment-step6-patch.md §2.3.
      const entityIdForDelete = selectedEntityId;
      await undo.execute({
        label: 'Delete entity',
        do: async () => {
          await ent.remove(entityIdForDelete, { cascade });
          const rest = { ...canvas.state.nodePositions };
          delete rest[entityIdForDelete];
          canvas.save({
            nodePositions: rest,
            viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
          });
        },
        undo: async () => {
          throw new NotUndoableError('Entity deletion is not reversible in MVP');
        },
      });
      setSelectedEntityId(null);
    },
    [ent, selectedEntityId, canvas, undo],
  );

  // Attribute handlers — every mutation flows through `undo.execute`.
  const attributeCreate = useCallback(
    (dto: Parameters<typeof attrs.create>[1]) => {
      if (!selectedEntityId) return Promise.reject(new Error('No entity selected'));
      const entityId = selectedEntityId;
      return undo.execute({
        label: 'Create attribute',
        do: () => attrs.create(entityId, dto),
        undo: async (_snap, createdAttr) => {
          await attrs.remove(entityId, createdAttr.id);
        },
      });
    },
    [attrs, selectedEntityId, undo],
  );
  const attributeUpdate = useCallback(
    (attrId: string, patch: Parameters<typeof attrs.update>[2]) => {
      if (!selectedEntityId) return Promise.reject(new Error('No entity selected'));
      const entityId = selectedEntityId;
      // Snapshot the current attribute so the inverse writes back the
      // exact previous field values for every patched key.
      const list = attrs.getFor(entityId);
      const current = list.find((a) => a.id === attrId);
      if (!current) return Promise.reject(new Error('Attribute not found'));
      const inversePatch: Record<string, unknown> = {};
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        inversePatch[k as string] = (current as unknown as Record<string, unknown>)[k as string];
      }
      return undo.execute({
        label: 'Update attribute',
        do: () => attrs.update(entityId, attrId, patch),
        undo: async () => {
          await attrs.update(entityId, attrId, inversePatch as typeof patch);
        },
      });
    },
    [attrs, selectedEntityId, undo],
  );
  const attributeDelete = useCallback(
    async (attrId: string) => {
      if (!selectedEntityId) return;
      const entityId = selectedEntityId;
      // Capture the full DTO before the delete so the inverse can
      // reconstruct the row. The recreated row gets a new UUID —
      // acceptable because the stack doesn't track downstream refs.
      const list = attrs.getFor(entityId);
      const snapshot = list.find((a) => a.id === attrId);
      if (!snapshot) return;
      await undo.execute({
        label: 'Delete attribute',
        do: async () => {
          await attrs.remove(entityId, attrId);
        },
        undo: async () => {
          // AttributeSummary.classification is widened to `string | null`
          // at the hook boundary; AttributeCreate narrows to a literal
          // enum. The value came from the server so it's valid — cast
          // through the inferred enum of the create input.
          type CreateInput = Parameters<typeof attrs.create>[1];
          await attrs.create(entityId, {
            name: snapshot.name,
            businessName: snapshot.businessName,
            description: snapshot.description,
            dataType: snapshot.dataType,
            length: snapshot.length,
            precision: snapshot.precision,
            scale: snapshot.scale,
            isNullable: snapshot.isNullable,
            isPrimaryKey: snapshot.isPrimaryKey,
            isForeignKey: snapshot.isForeignKey,
            isUnique: snapshot.isUnique,
            defaultValue: snapshot.defaultValue,
            classification: snapshot.classification as CreateInput['classification'],
            transformationLogic: snapshot.transformationLogic,
          });
        },
      });
    },
    [attrs, selectedEntityId, undo],
  );
  const attributeReorder = useCallback(
    async (orderedIds: string[]) => {
      if (!selectedEntityId) return;
      const entityId = selectedEntityId;
      const previousOrder = attrs.getFor(entityId).map((a) => a.id);
      await undo.execute({
        label: 'Reorder attributes',
        do: async () => {
          await attrs.reorder(entityId, orderedIds);
        },
        undo: async () => {
          await attrs.reorder(entityId, previousOrder);
        },
      });
    },
    [attrs, selectedEntityId, undo],
  );

  const generateSyntheticForSelected = useCallback(async () => {
    if (!selectedEntityId) return;
    setSyntheticOpen(true);
    setSyntheticLoading(true);
    setSyntheticError(null);
    setSyntheticResult(null);
    try {
      const res = await attrs.generateSyntheticData(selectedEntityId, 10);
      setSyntheticResult(res);
    } catch (e) {
      setSyntheticError(e instanceof Error ? e.message : 'Synthetic data generation failed');
    } finally {
      setSyntheticLoading(false);
    }
  }, [attrs, selectedEntityId]);

  // Relationship mutations piped through the panel — all flow through
  // the shared undo stack. Update is snapshot-and-revert; delete
  // captures the full DTO + creates a fresh rel on inverse (new UUID).
  const relUpdate = useCallback(
    async (
      relId: string,
      patch: {
        name?: string | null;
        sourceCardinality?: Cardinality;
        targetCardinality?: Cardinality;
        isIdentifying?: boolean;
      },
      clientVersion: number,
    ) => {
      const current = rels.relationships.find((r) => r.id === relId);
      if (!current) return rels.update(relId, patch, clientVersion);
      const inversePatch: typeof patch = {};
      if (patch.name !== undefined) inversePatch.name = current.name;
      if (patch.sourceCardinality !== undefined)
        inversePatch.sourceCardinality = current.sourceCardinality;
      if (patch.targetCardinality !== undefined)
        inversePatch.targetCardinality = current.targetCardinality;
      if (patch.isIdentifying !== undefined) inversePatch.isIdentifying = current.isIdentifying;
      const label =
        patch.isIdentifying === true
          ? 'Mark relationship as identifying'
          : patch.isIdentifying === false
            ? 'Clear identifying flag'
            : 'Update relationship';
      return undo.execute({
        label,
        do: () => rels.update(relId, patch, clientVersion),
        undo: async (_snap, res) => {
          // On VERSION_CONFLICT the forward returned a conflict marker,
          // not an updated rel — nothing to undo.
          if (isVersionConflictResult(res)) return;
          await rels.update(relId, inversePatch, res.version);
        },
      });
    },
    [rels, undo],
  );

  const relDelete = useCallback(
    async (relId: string) => {
      const snapshot = rels.relationships.find((r) => r.id === relId);
      if (!snapshot) return;
      await undo.execute({
        label: 'Delete relationship',
        do: async () => {
          await rels.remove(relId);
        },
        undo: async () => {
          await rels.create({
            sourceEntityId: snapshot.sourceEntityId,
            targetEntityId: snapshot.targetEntityId,
            name: snapshot.name,
            sourceCardinality: snapshot.sourceCardinality,
            targetCardinality: snapshot.targetCardinality,
            isIdentifying: snapshot.isIdentifying,
            layer: snapshot.layer,
          });
        },
      });
      setSelectedRelId(null);
    },
    [rels, undo],
  );

  const relConflict = useCallback(() => {
    void rels.loadAll();
  }, [rels]);

  // Context-menu actions bound to edgeMenu.rel. All flow through the
  // shared undo stack so Cmd+Z reverses them like any other mutation.
  const contextRename = useCallback(
    async (name: string | null) => {
      if (!edgeMenu) return;
      const previous = edgeMenu.rel.name;
      const rel = edgeMenu.rel;
      const res = await undo.execute({
        label: 'Rename relationship',
        do: () => rels.update(rel.id, { name }, rel.version),
        undo: async (_snap, r) => {
          if (isVersionConflictResult(r)) return;
          await rels.update(rel.id, { name: previous }, r.version);
        },
      });
      if (isVersionConflictResult(res)) void rels.loadAll();
    },
    [edgeMenu, rels, undo],
  );
  const contextFlip = useCallback(async () => {
    if (!edgeMenu) return;
    const rel = edgeMenu.rel;
    const res = await undo.execute({
      label: 'Flip relationship direction',
      do: () =>
        rels.update(
          rel.id,
          {
            sourceEntityId: rel.targetEntityId,
            targetEntityId: rel.sourceEntityId,
            sourceCardinality: rel.targetCardinality,
            targetCardinality: rel.sourceCardinality,
          },
          rel.version,
        ),
      undo: async (_snap, r) => {
        if (isVersionConflictResult(r)) return;
        await rels.update(
          rel.id,
          {
            sourceEntityId: rel.sourceEntityId,
            targetEntityId: rel.targetEntityId,
            sourceCardinality: rel.sourceCardinality,
            targetCardinality: rel.targetCardinality,
          },
          r.version,
        );
      },
    });
    if (isVersionConflictResult(res)) void rels.loadAll();
  }, [edgeMenu, rels, undo]);
  const contextToggleIdentifying = useCallback(async () => {
    if (!edgeMenu) return;
    const rel = edgeMenu.rel;
    const nextFlag = !rel.isIdentifying;
    const res = await undo.execute({
      label: nextFlag ? 'Mark relationship as identifying' : 'Clear identifying flag',
      do: () => rels.update(rel.id, { isIdentifying: nextFlag }, rel.version),
      undo: async (_snap, r) => {
        if (isVersionConflictResult(r)) return;
        await rels.update(rel.id, { isIdentifying: rel.isIdentifying }, r.version);
      },
    });
    if (isVersionConflictResult(res)) void rels.loadAll();
  }, [edgeMenu, rels, undo]);
  const contextDelete = useCallback(async () => {
    if (!edgeMenu) return;
    const snapshot = edgeMenu.rel;
    await undo.execute({
      label: 'Delete relationship',
      do: async () => {
        await rels.remove(snapshot.id);
      },
      undo: async () => {
        await rels.create({
          sourceEntityId: snapshot.sourceEntityId,
          targetEntityId: snapshot.targetEntityId,
          name: snapshot.name,
          sourceCardinality: snapshot.sourceCardinality,
          targetCardinality: snapshot.targetCardinality,
          isIdentifying: snapshot.isIdentifying,
          layer: snapshot.layer,
        });
      },
    });
  }, [edgeMenu, rels, undo]);

  const toggleOrphanBadges = (next: boolean) => {
    setShowOrphanBadges(next);
    publish('showOrphanBadges', next);
  };

  const applyTidyLayout = useCallback(
    (laidOut: Node[]) => {
      const nextPositions: Record<string, { x: number; y: number }> = {};
      for (const n of laidOut) nextPositions[n.id] = { x: n.position.x, y: n.position.y };
      canvas.save({
        nodePositions: nextPositions,
        viewport: canvas.state.viewport ?? { x: 0, y: 0, zoom: 1 },
      });
    },
    [canvas],
  );

  const empty = !canvas.isLoading && ent.entities.filter((e) => e.layer === layer).length === 0;

  return (
    <div className="relative h-full w-full">
      {/* Canvas header — notation toggle, orphan toggle, tidy, infer,
          undo/redo. */}
      <div className="pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-2">
        <NotationSwitcher modelId={modelId} layer={layer} />
        <UndoRedoButtons />
        <TidyButton nodes={nodes} edges={edges} onLayout={applyTidyLayout} />
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2/70 px-2 py-1 text-[11px] text-text-secondary backdrop-blur-xl">
          <input
            type="checkbox"
            data-testid="orphan-badges-toggle"
            checked={showOrphanBadges}
            onChange={(e) => toggleOrphanBadges(e.target.checked)}
            className="h-3 w-3 accent-yellow-400"
          />
          Orphan dots
        </label>
        <button
          type="button"
          data-testid="infer-rels-button"
          onClick={() => setInferOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-gradient-to-r from-accent/15 to-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-accent backdrop-blur-xl hover:from-accent/25 hover:to-amber-500/20"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Infer rels
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onNodesDelete={handleNodesDelete}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        onConnect={handleConnect}
        onPaneClick={() => {
          setSelectedEntityId(null);
          setSelectedRelId(null);
        }}
        onPaneContextMenu={(e) => e.preventDefault()}
        onDoubleClick={handlePaneDoubleClick}
        minZoom={0.1}
        maxZoom={3}
        onMoveEnd={handleMoveEnd}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnScroll
        zoomOnScroll
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
          <div className="max-w-md rounded-2xl border border-white/5 bg-surface-2/60 backdrop-blur-xl p-5 text-center shadow-[0_0_24px_rgba(255,214,10,0.12)]">
            <p className="text-sm font-medium text-text-primary">Empty {layer} layer</p>
            <p className="mt-1 text-xs text-text-secondary">
              Double-click anywhere on the canvas to drop your first entity. You can rename it,
              auto-describe it, and switch layers from the header.
            </p>
          </div>
        </div>
      )}

      {/* Right-docked entity editor (Phase 4/5 unchanged). */}
      <EntityEditor
        entity={selectedEntity}
        attributes={attrs.getFor(selectedEntityId)}
        attributesBusy={attrs.isLoading}
        onClose={() => setSelectedEntityId(null)}
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

      {/* Right-docked rel editor. */}
      <RelationshipPanel
        relationship={selectedRel}
        entities={ent.entities}
        auditEvents={relAuditEvents}
        auditLoading={false}
        onClose={() => setSelectedRelId(null)}
        onUpdate={relUpdate}
        onDelete={relDelete}
        onConflict={relConflict}
      />

      {/* Synthetic data drawer (Phase 4). */}
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

      {/* Cascade-delete dialog. */}
      <CascadeDeleteDialog
        isOpen={cascadeEntityId !== null}
        entityId={cascadeEntityId}
        entityName={ent.entities.find((e) => e.id === cascadeEntityId)?.name ?? null}
        getEntityImpact={rels.getEntityImpact}
        relationships={rels.relationships}
        entities={ent.entities}
        onConfirm={async () => {
          if (!cascadeEntityId) return;
          await ent.remove(cascadeEntityId, { cascade: true });
          setCascadeEntityId(null);
          setSelectedEntityId(null);
          void rels.loadAll();
        }}
        onClose={() => setCascadeEntityId(null)}
      />

      {/* Inference bottom drawer. */}
      <InferRelationshipsPanel
        isOpen={inferOpen}
        onClose={() => setInferOpen(false)}
        layer={layer}
        onInfer={rels.inferFromFkGraph}
        onCreate={rels.create}
      />

      {/* Right-click edge menu. */}
      {edgeMenu && (
        <EdgeContextMenu
          relationship={edgeMenu.rel}
          x={edgeMenu.x}
          y={edgeMenu.y}
          onClose={() => setEdgeMenu(null)}
          onRename={contextRename}
          onFlip={contextFlip}
          onToggleIdentifying={contextToggleIdentifying}
          onDelete={contextDelete}
        />
      )}

      {/* Pending FK ↔ rel suggestions surfaced by useRelationshipSyncBridge.
          Each suggestion gets its own inline button. The 4A toast is already
          fired by the bridge hook; this strip is the keyboard-friendly UI. */}
      {bridge.pendingSuggestions.length > 0 && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {bridge.pendingSuggestions.map((s) => (
            <div
              key={s.id}
              data-testid="rel-sync-suggestion"
              className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-gradient-to-r from-accent/15 to-amber-500/10 px-3 py-1.5 text-[11px] text-accent shadow-[0_0_16px_rgba(255,214,10,0.2)] backdrop-blur-xl"
            >
              {s.kind === 'fk-to-rel' ? (
                <span>
                  {s.attrName} → create rel {s.sourceEntityName}→{s.inferredTargetEntityName}?
                </span>
              ) : (
                <span>
                  Also clear FK flag on {s.entityName}.{s.attrName}?
                </span>
              )}
              <button
                type="button"
                data-testid={`rel-sync-confirm-${s.id}`}
                onClick={async () => {
                  await s.confirm();
                  bridge.dismiss(s.id);
                }}
                className="rounded border border-accent/40 bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/30"
              >
                ⌘↵
              </button>
              <button
                type="button"
                onClick={() => bridge.dismiss(s.id)}
                className="rounded p-1 text-accent/70 hover:bg-white/5 hover:text-accent"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {(canvas.error || ent.error || attrs.error || rels.error) && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-red-500/80 text-white text-[11px] px-2.5 py-1 shadow-lg">
          {canvas.error || ent.error || attrs.error || rels.error}
        </div>
      )}
    </div>
  );
}
