import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import type { DataModelSummary } from '../hooks/useModels';
import { ModelStudioCanvas } from '../components/model-studio/ModelStudioCanvas';

/**
 * Step 2 detail shell — the Step 3 canvas lands here.
 *
 * What ships today:
 *  - Header with the model name, layer selector (inert), notation
 *    selector (inert), and a back link.
 *  - Placeholder body that telegraphs "canvas arrives in Step 3"
 *    so nothing looks half-broken.
 *  - 404 handling: if the user can't access the model, show a polite
 *    "not found or no access" card with a back link (intentional —
 *    matches the server's hide-existence design).
 *
 * What does NOT ship here yet (Step 3+):
 *  - React Flow canvas + node types
 *  - Entity detail side panel
 *  - Chat drawer
 */

export function ModelStudioDetailPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const [model, setModel] = useState<DataModelSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return <CenteredStatus message="Loading model…" />;
  }
  if (notFound) {
    return <CenteredStatus message="Model not found or you don't have access." showBack />;
  }
  if (error || !model) {
    return <CenteredStatus message={error ?? 'Something went wrong.'} showBack />;
  }

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
          {model.ownerName && (
            <span className="hidden md:inline text-[11px] uppercase tracking-wider text-text-secondary/60 shrink-0 pl-2">
              · by {model.ownerName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <InertSelect label={capitalize(model.activeLayer)} />
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <ModelStudioCanvas modelId={model.id} layer={model.activeLayer} />
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

function InertSelect({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wider bg-surface-1/50 backdrop-blur border border-white/5 text-text-secondary/80"
      aria-label={`${label} (inert — Step 3)`}
    >
      {label}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </span>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
