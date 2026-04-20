import { Construction } from 'lucide-react';

/**
 * Step 5 follow-up — placeholder for tabs whose backing feature hasn't
 * shipped yet. Keeps the Erwin tab bar visually stable as later steps
 * light up individual tabs (Link → Step 7, Business Terms Mapping →
 * Step 8, etc.). The tab is disabled-but-visible in the strip above;
 * this component is what renders when someone somehow lands on it.
 */

export interface StubTabProps {
  /** Short label shown under the construction icon. */
  title: string;
  /** One-sentence explanation of what this tab will do when it ships. */
  description: string;
  /** The build step that will turn this tab on. Shows as a chip. */
  shipsIn: string;
}

export function StubTab({ title, description, shipsIn }: StubTabProps) {
  return (
    <div
      data-testid="attribute-tab-stub"
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-accent/15 blur-2xl" aria-hidden />
        <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-surface-1/60 text-text-secondary">
          <Construction className="h-5 w-5" />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-text-secondary">{description}</p>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-gradient-to-r from-accent/15 to-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(255,214,10,0.6)]" />
        Ships in {shipsIn}
      </span>
    </div>
  );
}
