import { useState } from 'react';
import { Boxes, ImagePlus, Code2, Sparkles, PlusSquare, Power } from 'lucide-react';
import { useModelStudioFlag } from '../hooks/useModelStudioFlag';
import { useAuth } from '../context/AuthContext';

/**
 * Step 1 scaffold.
 *
 *  - Flag OFF or loading → "Coming soon" stub. Admins see an Enable button.
 *  - Flag ON             → Infection-Virus empty state with three quick-start
 *                          cards teasing delights D10 (whiteboard), D8 (paste
 *                          SQL), and "Create blank model". Admins see a
 *                          small Disable link.
 *
 * Hooks are declared above the conditional return (lesson 6).
 */
export function ModelStudioPage() {
  const { enabled, isLoading, setEnabled } = useModelStudioFlag();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrator';

  if (isLoading || !enabled) {
    return <ComingSoonStub isAdmin={isAdmin} onEnable={() => setEnabled(true)} />;
  }

  return <ModelStudioEmptyState />;
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

function ModelStudioEmptyState() {
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
          hint="Step 2 unlocks this"
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
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        'group relative flex flex-col gap-3 rounded-2xl border p-5',
        'bg-surface-2/50 backdrop-blur border-white/5',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_0_24px_rgba(255,214,10,0.18)]',
        accent ? 'ring-1 ring-accent/20' : '',
      ].join(' ')}
    >
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
      <span className="mt-auto text-[10px] uppercase tracking-wider text-text-secondary/60">
        {hint}
      </span>
    </div>
  );
}
