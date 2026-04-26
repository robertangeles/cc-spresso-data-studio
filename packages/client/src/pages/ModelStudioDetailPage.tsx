import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Boxes } from 'lucide-react';
import type { Layer } from '@cc/shared';
import { api } from '../lib/api';
import type { DataModelSummary } from '../hooks/useModels';
import { ModelStudioCanvas } from '../components/model-studio/ModelStudioCanvas';
import { LayerSwitcher } from '../components/model-studio/LayerSwitcher';
import { OriginDirectionBadge } from '../components/model-studio/OriginDirectionBadge';
import { ProjectionChainBreadcrumb } from '../components/model-studio/ProjectionChainBreadcrumb';
import { LinkedObjectsPanel } from '../components/model-studio/LinkedObjectsPanel';
import { ProjectToModal } from '../components/model-studio/ProjectToModal';
import { LayerLinkSuggestionsPanel } from '../components/model-studio/LayerLinkSuggestionsPanel';
import { useBroadcastCanvas } from '../hooks/useBroadcastCanvas';
import { useProjectionChain } from '../hooks/useProjectionChain';
import { useLayerCoverage } from '../hooks/useLayerCoverage';
import { useLayerLinks } from '../hooks/useLayerLinks';
import { useToast } from '../components/ui/Toast';
import { Link as LinkIcon, Sparkles } from 'lucide-react';

/**
 * Model detail shell.
 *
 * Step 2 shipped the 404/access gate + trust-chain header; Step 3 wired
 * the React Flow canvas; Step 7 (this lane) replaces the inert layer
 * label with a writable `LayerSwitcher`, adds an `OriginDirectionBadge`
 * next to the model name, and owns the side effects of switching
 * layers:
 *
 *   - URL `?layer=` stays in sync (source of truth in-session — 0E-3).
 *   - `PATCH /models/:id { activeLayer }` autosaves on every switch
 *     so reload-without-URL returns to the same layer (S7-C7).
 *   - `useBroadcastCanvas` publishes the new layer so peer tabs
 *     follow silently (0E-3 "follow silently like notation does").
 *   - EDGE-1 (pessimistic): we only update URL + local state AFTER
 *     the PATCH resolves, so a network failure doesn't leave the UI
 *     showing a layer the server never saw.
 *
 * Breadcrumb (EXP-2) is intentionally NOT mounted here yet — wiring
 * it requires the canvas's selection state to live at this level.
 * That refactor is Lane 4 scope; the component sits on disk ready.
 */

function isLayer(x: unknown): x is Layer {
  return x === 'conceptual' || x === 'logical' || x === 'physical';
}

export function ModelStudioDetailPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const [model, setModel] = useState<DataModelSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSwitchingLayer, setIsSwitchingLayer] = useState(false);
  // Lifted from the canvas in Lane 4 so the projection-chain breadcrumb
  // (header) + linked-objects panel (sibling of canvas) can react to
  // selection without prop-drilling state out of React Flow.
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [linkedPanelOpen, setLinkedPanelOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { toast } = useToast();

  const { publish, subscribe } = useBroadcastCanvas(modelId);
  const projectionChain = useProjectionChain(modelId);
  const layerCoverage = useLayerCoverage(modelId);
  const layerLinks = useLayerLinks(modelId);

  // Load the model once.
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);
    setError(null);
    (async () => {
      try {
        const { data } = await api.get<{ data: DataModelSummary }>(
          `/model-studio/models/${modelId}`,
        );
        if (!cancelled) setModel(data.data);
      } catch (e) {
        if (cancelled) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : 'Failed to load model');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  // URL is the in-session source of truth. Fall back to the model's
  // persisted activeLayer when the URL has no `?layer=` or its value
  // is unrecognised. The `activeLayer` below is what the canvas + the
  // switcher both render against.
  const urlLayer = searchParams.get('layer');
  const activeLayer: Layer | undefined = isLayer(urlLayer) ? urlLayer : model?.activeLayer;

  // When the model finishes loading and the URL is missing a layer
  // param, seed it from the model so subsequent URL changes (back
  // button, share-link) have a consistent starting point. `replace`
  // so this doesn't add a no-op history entry.
  useEffect(() => {
    if (!model) return;
    if (isLayer(urlLayer)) return;
    setSearchParams({ layer: model.activeLayer }, { replace: true });
  }, [model, urlLayer, setSearchParams]);

  // Peer-tab sync (0E-3) — follow silently. No toast, no confirmation;
  // the expectation is that two tabs on the same model feel like one
  // view, exactly like the notation switcher already does.
  useEffect(() => {
    const unsubscribe = subscribe('layer', (next) => {
      if (isLayer(next)) {
        setSearchParams({ layer: next }, { replace: true });
      }
    });
    return unsubscribe;
  }, [subscribe, setSearchParams]);

  // Layer switch handler — wired into LayerSwitcher below.
  // Pessimistic flow (EDGE-1): PATCH first, then update URL + local
  // state + broadcast. Failure shows a toast and leaves the UI on the
  // old layer; no optimistic flash-and-revert.
  const handleLayerChange = useCallback(
    async (next: Layer) => {
      if (!modelId || !model) return;
      if (next === activeLayer) return;
      setIsSwitchingLayer(true);
      try {
        await api.patch(`/model-studio/models/${modelId}`, { activeLayer: next });
        setSearchParams({ layer: next });
        setModel((prev) => (prev ? { ...prev, activeLayer: next } : prev));
        publish('layer', next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save layer change';
        toast(msg, 'error');
      } finally {
        setIsSwitchingLayer(false);
      }
    },
    [modelId, model, activeLayer, publish, setSearchParams, toast],
  );

  // Load projection chain whenever the selection changes. The hook
  // caches per-entityId so re-selecting an entity is instant. Layer-
  // link mutations (Lane 5+) will call invalidateAll() to drop stale
  // chains.
  const loadChain = projectionChain.loadChain;
  useEffect(() => {
    if (!selectedEntityId) return;
    void loadChain(selectedEntityId);
  }, [selectedEntityId, loadChain]);

  // Load coverage matrix once on model open. Reload after any layer-
  // link mutation (auto-project, manual link/unlink — wired via
  // `handleProjectionMutated` below).
  const loadCoverage = layerCoverage.loadCoverage;
  useEffect(() => {
    if (!modelId) return;
    void loadCoverage();
  }, [modelId, loadCoverage]);

  // Refresh coverage + drop the chain cache whenever a layer-link
  // mutation lands. The canvas calls this after auto-project succeeds.
  const handleProjectionMutated = useCallback(() => {
    void loadCoverage();
    projectionChain.invalidateAll();
  }, [loadCoverage, projectionChain]);

  // Breadcrumb segment click: switch layer + select that segment's
  // entity. Reuses the same pessimistic PATCH-first flow as the pill
  // switcher (toast on failure, no UI rollback half-step).
  const handleChainSegmentClick = useCallback(
    async (entityId: string, layer: Layer) => {
      if (layer === activeLayer) {
        setSelectedEntityId(entityId);
        return;
      }
      if (!modelId || !model) return;
      setIsSwitchingLayer(true);
      try {
        await api.patch(`/model-studio/models/${modelId}`, { activeLayer: layer });
        setSearchParams({ layer });
        setModel((prev) => (prev ? { ...prev, activeLayer: layer } : prev));
        publish('layer', layer);
        setSelectedEntityId(entityId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to follow projection';
        toast(msg, 'error');
      } finally {
        setIsSwitchingLayer(false);
      }
    },
    [modelId, model, activeLayer, publish, setSearchParams, toast],
  );

  if (isLoading) {
    return <CenteredStatus message="Loading model…" />;
  }
  if (notFound) {
    return <CenteredStatus message="Model not found or you don't have access." showBack />;
  }
  if (error || !model) {
    return <CenteredStatus message={error ?? 'Something went wrong.'} showBack />;
  }

  // `activeLayer` is guaranteed defined past this point because
  // `model` exists, and the URL-seed effect above ensures the URL
  // carries a valid layer (or we fall back to model.activeLayer).
  const currentLayer: Layer = activeLayer ?? model.activeLayer;
  const selectedChain = selectedEntityId ? projectionChain.chains[selectedEntityId] : null;
  const selectedNode = selectedChain?.nodes.find((n) => n.entityId === selectedEntityId) ?? null;

  // D-2 amber glow on the LayerSwitcher fires when ANY entity in the
  // model has a chain that doesn't reach the terminal layer for the
  // model's origin direction:
  //   - greenfield: terminal is physical, so any cell with
  //     `physical === false` represents unfinished work upstream.
  //   - existing_system: terminal is conceptual, so any cell with
  //     `conceptual === false` represents unfinished work upstream.
  // Model-scoped (not layer-scoped) because the glow's purpose is
  // "you have linkable work somewhere" — the user doesn't need to
  // land on the offending layer first to be reminded.
  const terminalLayer: Layer = model.originDirection === 'greenfield' ? 'physical' : 'conceptual';
  const hasUnlinkedEntities = Object.values(layerCoverage.coverage).some(
    (cell) => cell[terminalLayer] === false,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-white/5 bg-surface-2/40 backdrop-blur px-5 py-3">
        <Link
          to="/model-studio"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All models
        </Link>

        {/* Trust chain — provenance first, then the model name. */}
        <div className="flex items-center gap-2 pl-3 border-l border-white/5 min-w-0">
          <TrustChain
            organisation={model.organisationName}
            client={model.clientName}
            project={model.projectName}
          />
          <span className="text-text-secondary/40">›</span>
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent/20 via-accent/5 to-transparent border border-accent/30 text-accent shadow-[0_0_8px_rgba(255,214,10,0.15)] shrink-0">
            <Boxes className="h-3 w-3" />
          </div>
          <h1 className="text-sm font-semibold text-text-primary truncate">{model.name}</h1>
          <OriginDirectionBadge value={model.originDirection} />
          {model.ownerName && (
            <span className="hidden md:inline text-[11px] uppercase tracking-wider text-text-secondary/60 shrink-0 pl-2">
              · by {model.ownerName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Suggestions toggle — model-wide so it's always visible
              regardless of selection. Opens the bottom-docked
              LayerLinkSuggestionsPanel which scans for name-matched
              candidate pairs across two layers. */}
          <button
            type="button"
            data-testid="open-suggestions-button"
            aria-pressed={suggestionsOpen}
            aria-label="Toggle layer-link suggestions panel"
            onClick={() => setSuggestionsOpen((prev) => !prev)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1',
              'text-[11px] font-medium backdrop-blur-xl',
              suggestionsOpen
                ? 'border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10 text-accent shadow-[0_0_8px_rgba(255,214,10,0.2)]'
                : 'border border-white/10 bg-surface-2/70 text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Suggest
          </button>
          {/* Linked-objects toggle — only meaningful when an entity is
              selected. The breadcrumb above shows the canonical chain;
              this opens a richer per-layer view (multi-parent / multi-
              child + the Link-existing modal). */}
          {selectedEntityId && (
            <button
              type="button"
              data-testid="open-linked-objects-button"
              aria-pressed={linkedPanelOpen}
              aria-label="Toggle linked objects panel"
              onClick={() => setLinkedPanelOpen((prev) => !prev)}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1',
                'text-[11px] font-medium backdrop-blur-xl',
                linkedPanelOpen
                  ? 'border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10 text-accent shadow-[0_0_8px_rgba(255,214,10,0.2)]'
                  : 'border border-white/10 bg-surface-2/70 text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Linked
            </button>
          )}
          <LayerSwitcher
            value={currentLayer}
            onChange={handleLayerChange}
            disabled={isSwitchingLayer}
            hasUnlinkedEntities={hasUnlinkedEntities}
          />
        </div>
      </header>

      {/* Breadcrumb row — appears only when the focused entity has a
          cross-layer chain to show. Sits between the header and canvas
          so the chain reads top-to-bottom from layers above (the
          "ancestor" projections) into the canvas, which renders the
          current layer's view. */}
      {selectedChain && (
        <div className="border-b border-white/5 bg-surface-2/30 px-5 py-1.5">
          <ProjectionChainBreadcrumb
            chain={selectedChain}
            onSegmentClick={handleChainSegmentClick}
          />
        </div>
      )}

      <main className="relative flex-1 overflow-hidden">
        <ModelStudioCanvas
          modelId={model.id}
          layer={currentLayer}
          selectedEntityId={selectedEntityId}
          onSelectEntity={setSelectedEntityId}
          coverage={layerCoverage.coverage}
          originDirection={model.originDirection}
          onProjectionMutated={handleProjectionMutated}
        />

        <LinkedObjectsPanel
          isOpen={linkedPanelOpen && selectedEntityId !== null}
          chain={selectedChain}
          onClose={() => setLinkedPanelOpen(false)}
          onJumpTo={handleChainSegmentClick}
          onLinkExisting={selectedNode ? () => setProjectModalOpen(true) : undefined}
        />

        {selectedNode && (
          <ProjectToModal
            isOpen={projectModalOpen}
            modelId={model.id}
            sourceEntityId={selectedNode.entityId}
            sourceEntityLayer={selectedNode.layer}
            sourceEntityName={selectedNode.entityName}
            onClose={() => setProjectModalOpen(false)}
            onLinked={() => {
              handleProjectionMutated();
              setProjectModalOpen(false);
            }}
          />
        )}

        <LayerLinkSuggestionsPanel
          isOpen={suggestionsOpen}
          onClose={() => setSuggestionsOpen(false)}
          defaultFrom={currentLayer}
          defaultTo={
            (['conceptual', 'logical', 'physical'] as Layer[]).find((l) => l !== currentLayer) ??
            'logical'
          }
          suggestions={layerCoverage.suggestions}
          isLoading={layerCoverage.isLoading}
          loadSuggestions={layerCoverage.loadSuggestions}
          clearSuggestions={layerCoverage.clearSuggestions}
          onAccept={layerLinks.create}
          onAccepted={handleProjectionMutated}
        />
      </main>
    </div>
  );
}

function CenteredStatus({ message, showBack = false }: { message: string; showBack?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
      {showBack && (
        <Link
          to="/model-studio"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all models
        </Link>
      )}
    </div>
  );
}

function TrustChain({
  organisation,
  client,
  project,
}: {
  organisation: string | null;
  client: string | null;
  project: string | null;
}) {
  const links = [organisation, client, project].filter(Boolean) as string[];
  if (links.length === 0) return null;
  return (
    <span
      className="inline-flex items-center text-[11px] uppercase tracking-wider text-text-secondary/80 truncate min-w-0"
      title={links.join(' / ')}
    >
      {links.map((label, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mx-1 text-text-secondary/40">/</span>}
          <span className="truncate">{label}</span>
        </span>
      ))}
    </span>
  );
}
