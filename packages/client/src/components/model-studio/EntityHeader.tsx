import { casingForLayer, type Layer } from '@cc/shared';

/**
 * Step 6 Direction A — EntityHeader.
 *
 * Header row for an EntityNode. Renders:
 *   - The entity name, cased per `casingForLayer` so a senior modeller
 *     reading the canvas gets an immediate layer cue (lowercase
 *     snake_case on physical, Title Case on logical, Sentence case on
 *     conceptual).
 *   - An optional `displayId` chip (`E001`, `E002`, …) top-right, 10px
 *     muted-mono. Reads as a reference tag you can cite in governance
 *     artefacts without pulling open the entity.
 *
 * Deliberately excluded:
 *   - No key glyph on the header. In data modelling a "key" is a key
 *     COLUMN (PK / FK / BK), not an entity. Putting 🔑 next to an
 *     entity name misuses the symbol; keys belong in the attribute
 *     flag column, not the entity header.
 *   - No "P" layer chip (layer is already in the canvas header).
 *   - No "no business name" placeholder (render nothing when empty).
 *
 * When a naming-lint violation is present on the displayed name, we
 * underline it in amber (wavy + offset 4) so the senior practitioner
 * sees the issue in-diagram without popping the panel.
 */

export interface EntityHeaderProps {
  name: string;
  businessName?: string | null;
  layer: Layer;
  displayId?: string | null;
  hasLintViolation: boolean;
}

export function EntityHeader({
  name,
  businessName,
  layer,
  displayId,
  hasLintViolation,
}: EntityHeaderProps) {
  const cased = casingForLayer(name, layer) || 'untitled';
  return (
    <div
      data-testid="entity-header"
      className="relative px-3 pt-2.5 pb-1.5 flex items-center gap-2"
    >
      <span
        data-testid="entity-node-name"
        className={[
          'truncate text-sm font-semibold text-text-primary',
          hasLintViolation
            ? 'underline decoration-amber-400 decoration-wavy underline-offset-4'
            : '',
        ].join(' ')}
        title={businessName ?? undefined}
      >
        {cased}
      </span>
      {displayId ? (
        <span
          data-testid="entity-header-display-id"
          className="ml-auto font-mono text-[10px] text-text-secondary/60"
          title={`Display id ${displayId}`}
        >
          {displayId}
        </span>
      ) : null}
    </div>
  );
}
