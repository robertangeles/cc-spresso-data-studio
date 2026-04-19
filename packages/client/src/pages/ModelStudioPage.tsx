import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  ImagePlus,
  Code2,
  Sparkles,
  PlusSquare,
  Power,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useModelStudioFlag } from '../hooks/useModelStudioFlag';
import { useModels, type DataModelSummary } from '../hooks/useModels';
import { useAuth } from '../context/AuthContext';
import { CreateModelDialog } from '../components/model-studio/CreateModelDialog';

/**
 * Model Studio page — Step 2.
 *
 *  - Flag OFF / loading → "Coming soon" stub. Admins see an Enable button.
 *  - Flag ON:
 *    • 0 models  → Infection-Virus empty state with three quick-start cards.
 *                  "Start blank" is live; "From a whiteboard" (Step 11, D10)
 *                  and "From a query" (Step 10, D8) still gated.
 *    • ≥1 models → Model list grid + "New model" button.
 *
 * Hooks above any conditional return (lesson 6).
 */
export function ModelStudioPage() {
  const { enabled, isLoading: flagLoading, setEnabled } = useModelStudioFlag();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrator';

  // Call useModels unconditionally to keep hook order stable even when the
  // flag is OFF (the hook's effect short-circuits via the eventual 404 from
  // the feature-flag gate, which is harmless).
  const { models, total, isLoading: modelsLoading, refresh } = useModels();

  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const handleCreated = (m: DataModelSummary) => {
    setDialogOpen(false);
    refresh();
    navigate(`/model-studio/${m.id}`);
  };

  if (flagLoading || !enabled) {
    return <ComingSoonStub isAdmin={isAdmin} onEnable={() => setEnabled(true)} />;
  }

  const showList = !modelsLoading && total > 0;

  return (
    <>
      {showList ? (
        <ModelsListView
          models={models}
          onCreateClick={() => setDialogOpen(true)}
          onOpen={(id) => navigate(`/model-studio/${id}`)}
        />
      ) : (
        <ModelStudioEmptyState onStartBlank={() => setDialogOpen(true)} />
      )}
      <CreateModelDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}

function ComingSoonStub({
  isAdmin,
  onEnable,
}: {
  isAdmin: boolean;
  onEnable: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleEnable = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onEnable();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to enable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-20">
      <div className="relative">
        <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" aria-hidden="true" />
        <div className="relative p-4 rounded-2xl bg-gradient-to-br from-accent/20 via-accent/5 to-transparent border border-accent/30 shadow-[0_0_24px_rgba(255,214,10,0.15)]">
          <Boxes className="h-8 w-8 text-accent" />
        </div>
      </div>
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Model Studio</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Data modelling workspace — conceptual, logical, and physical layers aligned to DMBOK.
          Coming soon.
        </p>
      </div>
      {isAdmin && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className={[
              'group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5',
              'bg-gradient-to-r from-accent to-amber-600 text-black font-semibold text-sm',
              'shadow-[0_0_12px_rgba(255,214,10,0.25)]',
              'transition-all duration-300 ease-out',
              'hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(255,214,10,0.4)]',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
            ].join(' ')}
          >
            <Power className="h-4 w-4" />
            {busy ? 'Enabling…' : 'Enable Model Studio'}
          </button>
          <span className="text-[10px] uppercase tracking-wider text-text-secondary/60">
            Admin only · persists across sessions
          </span>
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      )}
    </div>
  );
}

function ModelStudioEmptyState({ onStartBlank }: { onStartBlank: () => void }) {
  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-10 px-6 py-16">
      {/* Ambient gradient behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_rgba(255,214,10,0.12),_transparent_70%)]"
      />

      <div className="relative flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 bg-accent/30 blur-3xl rounded-full" aria-hidden="true" />
          <div className="relative p-5 rounded-2xl bg-gradient-to-br from-accent/25 via-accent/5 to-transparent border border-accent/40 shadow-[0_0_36px_rgba(255,214,10,0.25)]">
            <Boxes className="h-10 w-10 text-accent" />
          </div>
        </div>

        <div className="text-center max-w-xl">
          <h1 className="bg-gradient-to-r from-text-primary to-accent bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Model Studio
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            A thinking surface for data architects. Conceptual, logical, and physical layers —
            linked, not duplicated. DDL that respects your craft. AI that pair-models with you.
          </p>
        </div>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        <QuickStartCard
          icon={<PlusSquare className="h-5 w-5" />}
          title="Start blank"
          description="Fresh conceptual model. Add entities, draw relationships, export DDL when ready."
          hint="Click to begin"
          onClick={onStartBlank}
          live
        />
        <QuickStartCard
          icon={<ImagePlus className="h-5 w-5" />}
          title="From a whiteboard"
          description="Drop a photo of any ER diagram or whiteboard — Spresso drafts the model for you."
          hint="Step 11 unlocks this"
          accent
        />
        <QuickStartCard
          icon={<Code2 className="h-5 w-5" />}
          title="From a query"
          description="Paste a SELECT query. We'll suggest the entities and attributes it implies."
          hint="Step 10 unlocks this"
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-text-secondary/80">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span>AI-native · keyboard-first · plugin-ready · DMBOK-aligned</span>
      </div>
    </div>
  );
}

function QuickStartCard({
  icon,
  title,
  description,
  hint,
  accent = false,
  live = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  accent?: boolean;
  live?: boolean;
  onClick?: () => void;
}) {
  const interactive = live && !!onClick;
  const className = [
    'group relative flex flex-col gap-3 rounded-2xl border p-5 text-left',
    'bg-surface-2/50 backdrop-blur border-white/5',
    'transition-all duration-300 ease-out',
    interactive
      ? 'cursor-pointer hover:-translate-y-1 hover:border-accent/60 hover:shadow-[0_0_32px_rgba(255,214,10,0.28)]'
      : 'hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_0_24px_rgba(255,214,10,0.18)]',
    accent ? 'ring-1 ring-accent/20' : '',
    interactive ? 'ring-1 ring-accent/40' : '',
  ].join(' ');

  const inner = (
    <>
      <div
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-xl',
          'bg-gradient-to-br from-accent/20 via-accent/5 to-transparent',
          'border border-accent/30 text-accent',
          'shadow-[0_0_12px_rgba(255,214,10,0.15)]',
        ].join(' ')}
      >
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-xs leading-relaxed text-text-secondary">{description}</p>
      <span
        className={[
          'mt-auto text-[10px] uppercase tracking-wider',
          interactive ? 'text-accent' : 'text-text-secondary/60',
        ].join(' ')}
      >
        {hint}
      </span>
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

// ============================================================
// Models list — shown when the user has ≥1 models
// ============================================================

function ModelsListView({
  models,
  onCreateClick,
  onOpen,
}: {
  models: DataModelSummary[];
  onCreateClick: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="relative mx-auto flex h-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,_rgba(255,214,10,0.08),_transparent_70%)]"
      />

      <header className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 via-accent/5 to-transparent border border-accent/40 text-accent shadow-[0_0_12px_rgba(255,214,10,0.2)]">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-text-primary">
              Model Studio
            </h1>
            <p className="text-xs text-text-secondary">
              {models.length} {models.length === 1 ? 'model' : 'models'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreateClick}
          className={[
            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold',
            'bg-gradient-to-r from-accent to-amber-600 text-black',
            'shadow-[0_0_12px_rgba(255,214,10,0.25)]',
            'transition-all duration-200',
            'hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(255,214,10,0.4)]',
          ].join(' ')}
        >
          <Plus className="h-4 w-4" />
          New model
        </button>
      </header>

      <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={m.id} model={m} onOpen={() => onOpen(m.id)} />
        ))}
      </div>
    </div>
  );
}

function ModelCard({ model, onOpen }: { model: DataModelSummary; onOpen: () => void }) {
  const layerColor =
    model.activeLayer === 'conceptual'
      ? 'text-amber-300 border-amber-300/30 bg-amber-300/5'
      : model.activeLayer === 'logical'
        ? 'text-sky-300 border-sky-300/30 bg-sky-300/5'
        : 'text-emerald-300 border-emerald-300/30 bg-emerald-300/5';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        'group relative flex flex-col gap-3 rounded-2xl border p-5 text-left',
        'bg-surface-2/50 backdrop-blur border-white/5',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_0_24px_rgba(255,214,10,0.18)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border',
            layerColor,
          ].join(' ')}
        >
          {model.activeLayer}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-text-secondary/40 group-hover:text-accent transition-colors" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary line-clamp-1">{model.name}</h3>
      {model.description && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
          {model.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between text-[10px] uppercase tracking-wider text-text-secondary/60">
        <span>{model.notation}</span>
        <span>{relativeTime(model.updatedAt)}</span>
      </div>
    </button>
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
