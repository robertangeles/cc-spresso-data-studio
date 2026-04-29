import type { OriginDirection } from '@cc/shared';

/**
 * Step 7 D-3 — one-word badge next to the model name indicating whether
 * this model was created as a greenfield design (top-down) or reverse-
 * engineered from an existing system (bottom-up). Affects Step 7's
 * default layer-traversal direction and the unlinked-glow direction,
 * so surfacing it in the header helps the user understand why the
 * canvas defaults behave the way they do.
 *
 * Read-only. `originDirection` is model-defining and set at creation
 * (see EditModelDialog docstring); changing it post-creation would
 * silently invert every directional nudge in the UI, so it stays
 * locked to the create dialog.
 */

export interface OriginDirectionBadgeProps {
  value: OriginDirection;
}

interface Display {
  label: string;
  tooltip: string;
}

const DISPLAY: Record<OriginDirection, Display> = {
  greenfield: {
    label: 'Greenfield',
    tooltip:
      'Top-down design: conceptual → logical → physical. Unlinked conceptual entities get an amber nudge to project downward.',
  },
  existing_system: {
    label: 'Existing System',
    tooltip:
      'Bottom-up reverse-engineering: physical → logical → conceptual. Unlinked physical entities get the amber nudge to project upward.',
  },
};

export function OriginDirectionBadge({ value }: OriginDirectionBadgeProps) {
  const { label, tooltip } = DISPLAY[value];
  return (
    <span
      data-testid="origin-direction-badge"
      title={tooltip}
      aria-label={`Origin direction: ${label}`}
      className={[
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        'bg-surface-1/60 border border-white/10 text-text-secondary/90',
        'backdrop-blur',
      ].join(' ')}
    >
      {label}
    </span>
  );
}
