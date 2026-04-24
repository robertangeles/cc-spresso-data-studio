import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Boxes } from 'lucide-react';
import type { Layer } from '@cc/shared';
import { api } from '../lib/api';
import type { DataModelSummary } from '../hooks/useModels';
import { ModelStudioCanvas } from '../components/model-studio/ModelStudioCanvas';
import { LayerSwitcher } from '../components/model-studio/LayerSwitcher';
import { OriginDirectionBadge } from '../components/model-studio/OriginDirectionBadge';
import { useBroadcastCanvas } from '../hooks/useBroadcastCanvas';
import { useToast } from '../components/ui/Toast';

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
  const { toast } = useToast();

  const { publish, subscribe } = useBroadcastCanvas(modelId);

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
          <LayerSwitcher
            value={currentLayer}
            onChange={handleLayerChange}
            disabled={isSwitchingLayer}
          />
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <ModelStudioCanvas modelId={model.id} layer={currentLayer} />
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
