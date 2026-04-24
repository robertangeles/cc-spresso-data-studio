/**
 * Step 6 Direction A — AttributeFlagCell.
 *
 * Renders ONLY the key-role flags a senior data modeller scans for
 * on the diagram: PK, FK, and BK/AK groups. Order is fixed
 * (PK → FK → AK) so a modeller's eye learns a consistent reading
 * sequence across every entity in the model.
 *
 * NN / UQ are intentionally NOT shown on the at-a-glance card. They
 * are constraint details — they belong in the attribute properties
 * panel, not the diagram view. Erwin / ER Studio follow the same
 * convention: diagrams show roles; the panel shows details. Showing
 * every constraint in-diagram creates visual noise that downgrades
 * the tool's credibility with 15-year practitioners.
 *
 * `isNn` / `isUq` are still accepted in the props type so consumers
 * don't have to branch, but the component never renders them.
 */

export interface AttributeFlagCellProps {
  isPk: boolean;
  isFk: boolean;
  /** Accepted for API compatibility; not rendered on the card. */
  isNn?: boolean;
  /** Accepted for API compatibility; not rendered on the card. */
  isUq?: boolean;
  altKeyGroup: string | null;
  /** Optional descriptive label for this AK group. Drives the badge
   *  tooltip — hovering `AK1` shows `AK1 — NI number` when set. Stored
   *  on the parent entity (shared by all columns in the same group).
   *  See `data_model_entities.alt_key_labels`. */
  altKeyLabel?: string | null;
}

export function AttributeFlagCell({
  isPk,
  isFk,
  altKeyGroup,
  altKeyLabel,
}: AttributeFlagCellProps) {
  // Base class shared by every code chip — keeps kerning and padding
  // consistent so a row with just `PK` aligns with a row that shows
  // `PK FK AK1`.
  const base = 'font-mono text-[9px] font-semibold tracking-wider px-1 py-0.5 rounded-sm';
  return (
    <span
      data-testid="attribute-flag-cell"
      className="inline-flex items-center gap-0.5 whitespace-nowrap"
    >
      {isPk ? (
        <span data-testid="attribute-flag-pk" className={`${base} text-accent`} title="Primary key">
          PK
        </span>
      ) : null}
      {isFk ? (
        <span
          data-testid="attribute-flag-fk"
          className={`${base} text-teal-300`}
          title="Foreign key"
        >
          FK
        </span>
      ) : null}
      {altKeyGroup ? (
        <span
          data-testid="attribute-flag-ak"
          className={`${base} text-amber-300`}
          title={
            altKeyLabel && altKeyLabel.trim()
              ? `${altKeyGroup} — ${altKeyLabel}`
              : `Alt key group ${altKeyGroup}`
          }
        >
          {altKeyGroup}
        </span>
      ) : null}
    </span>
  );
}
