import { useCallback } from 'react';
import type { Layer, Notation } from '@cc/shared';
import { useNotation } from '../../hooks/useNotation';

/**
 * Step 6 — IE / IDEF1X notation toggle mounted in the canvas header.
 *
 * D-R4: flipping notation must NOT re-mount edges (that would blow the
 * React Flow viewport). We only flip `data.notation`; React Flow keeps
 * the same edge instances around. See the unit test which asserts the
 * setNotation call path does not remount the edge array.
 *
 * Keyboard flow:
 *   - Tab into the pill group (role=radiogroup)
 *   - ← / → to move between pills
 *   - Enter / Space to commit (reuses the button's default behaviour).
 *
 * Visual language: glass-morphism pill group, amber glow on the active
 * option. Matches the layer switcher already in the canvas header
 * family.
 */

export interface NotationSwitcherProps {
  modelId: string;
  layer: Layer;
  /** Optional disabled state for the brief moment between layer switch
   *  and the new canvas-state fetch completing. */
  disabled?: boolean;
}

const OPTIONS: Array<{ value: Notation; label: string; tooltip: string }> = [
  {
    value: 'ie',
    label: 'IE',
    tooltip: 'Information Engineering — bars + crow’s feet. Chen/Martin school default.',
  },
  {
    value: 'idef1x',
    label: 'IDEF1X',
    tooltip: 'IDEF1X — US federal standard. Filled circles for "many".',
  },
];

export function NotationSwitcher({ modelId, layer, disabled }: NotationSwitcherProps) {
  const { notation, setNotation, isUpdating } = useNotation(modelId, layer);

  const onSelect = useCallback(
    (next: Notation) => {
      if (disabled || isUpdating) return;
      if (next === notation) return;
      void setNotation(next);
    },
    [disabled, isUpdating, notation, setNotation],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, current: Notation) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = OPTIONS.findIndex((o) => o.value === current);
    const nextIdx = (idx + (e.key === 'ArrowRight' ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
    onSelect(OPTIONS[nextIdx].value);
  };

  return (
    <div
      data-testid="notation-switcher"
      role="radiogroup"
      aria-label="Relationship notation"
      className={[
        'inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-surface-2/70 p-0.5',
        'backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.35)]',
        disabled ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.value === notation;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={opt.tooltip}
            data-testid={`notation-pill-${opt.value}`}
            onClick={() => onSelect(opt.value)}
            onKeyDown={(e) => onKeyDown(e, notation)}
            className={[
              'rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider transition-all',
              'focus:outline-none focus:ring-2 focus:ring-accent/50',
              isActive
                ? 'bg-gradient-to-r from-accent/25 to-amber-500/15 text-accent shadow-[0_0_12px_rgba(255,214,10,0.25)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
