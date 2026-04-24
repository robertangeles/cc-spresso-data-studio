import { useCallback, useEffect } from 'react';
import type { Layer } from '@cc/shared';

/**
 * Step 7 (S7-C1) — writable layer switcher mounted in the model detail
 * header. Replaces the `InertSelect` placeholder from Step 3.
 *
 * Controlled component. Callers own the side effects:
 *   - URL `?layer=` sync
 *   - PATCH `/models/:id` autosave (S7-C7)
 *   - Cross-tab broadcast via useBroadcastCanvas (0E-3 follow-silently)
 *   - Canvas crossfade (S7-C3)
 *
 * Keyboard flow:
 *   - Tab into the pill group (role=radiogroup)
 *   - ← / → move between pills
 *   - Shift+Alt+C / Shift+Alt+L / Shift+Alt+P globally from anywhere
 *     on the page — non-reserved across Chrome/Firefox/Safari on
 *     macOS/Windows/Linux (eng-review TENSION-4).
 *
 * Visual language mirrors `NotationSwitcher`: glass-morphism pill
 * group, amber glow on the active option. D-2 extension — when the
 * model has unlinked entities on the current layer, the whole
 * switcher gets a softer outer amber glow as a nudge.
 */

export interface LayerSwitcherProps {
  value: Layer;
  onChange(next: Layer): void;
  /** Brief disabled state while a layer switch is in-flight (the
   *  caller's PATCH + canvas-state fetch) to prevent double-clicks. */
  disabled?: boolean;
  /** D-2: entities on the CURRENT layer that have no projection on
   *  the next layer (per model's originDirection). When true, the
   *  switcher draws a softer amber halo as a gentle nudge. */
  hasUnlinkedEntities?: boolean;
}

interface LayerOption {
  value: Layer;
  label: string;
  /** The keyboard key pressed with Shift+Alt to jump to this layer.
   *  Using letters (not digits) avoids the Firefox/Windows Alt+digit
   *  tab-switcher and menu-mnemonic collisions. */
  shortcutKey: 'c' | 'l' | 'p';
  tooltip: string;
}

const OPTIONS: LayerOption[] = [
  {
    value: 'conceptual',
    label: 'Conceptual',
    shortcutKey: 'c',
    tooltip: 'Conceptual layer — entities + relationships, no attributes. Shift+Alt+C.',
  },
  {
    value: 'logical',
    label: 'Logical',
    shortcutKey: 'l',
    tooltip: 'Logical layer — normalised, DBMS-independent. Shift+Alt+L.',
  },
  {
    value: 'physical',
    label: 'Physical',
    shortcutKey: 'p',
    tooltip: 'Physical layer — storage + types + indexes. Shift+Alt+P.',
  },
];

export function LayerSwitcher({
  value,
  onChange,
  disabled,
  hasUnlinkedEntities,
}: LayerSwitcherProps) {
  const selectLayer = useCallback(
    (next: Layer) => {
      if (disabled) return;
      if (next === value) return;
      onChange(next);
    },
    [disabled, value, onChange],
  );

  // Global Shift+Alt+{letter} shortcut. Attached at document-level so
  // the user can flip layers without first focusing the pill group.
  // Skips when an input/textarea/contenteditable has focus so the
  // shortcut doesn't swallow text entry with an S/A/L/P letter.
  useEffect(() => {
    const isTextInputFocused = (): boolean => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || !e.altKey) return;
      if (e.ctrlKey || e.metaKey) return;
      if (isTextInputFocused()) return;

      const key = e.key.toLowerCase();
      const match = OPTIONS.find((o) => o.shortcutKey === key);
      if (!match) return;
      e.preventDefault();
      selectLayer(match.value);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectLayer]);

  // Arrow-key navigation inside the pill group (matches NotationSwitcher).
  const onArrowKey = (e: React.KeyboardEvent<HTMLButtonElement>, current: Layer) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = OPTIONS.findIndex((o) => o.value === current);
    const nextIdx = (idx + (e.key === 'ArrowRight' ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
    selectLayer(OPTIONS[nextIdx]!.value);
  };

  return (
    <div
      data-testid="layer-switcher"
      role="radiogroup"
      aria-label="Active layer"
      className={[
        'inline-flex items-center gap-0.5 rounded-lg border p-0.5',
        'bg-surface-2/70 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.35)]',
        // D-2 glow: softer outer halo when there are unlinked entities.
        // Amber but dimmer than the active-pill glow so it reads as a
        // nudge, not an alert.
        hasUnlinkedEntities
          ? 'border-accent/30 shadow-[0_0_12px_rgba(255,214,10,0.18)]'
          : 'border-white/10',
        disabled ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={opt.tooltip}
            data-testid={`layer-pill-${opt.value}`}
            onClick={() => selectLayer(opt.value)}
            onKeyDown={(e) => onArrowKey(e, value)}
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
