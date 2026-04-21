/**
 * Step 6 Direction A — AttributeFlagCell.
 *
 * Renders the text-code flag cluster for an attribute row: `PK FK AK1
 * NN UQ`. Codes are rendered as mono-spaced 9px uppercase chips,
 * omitted entirely when the underlying flag is false. Order is fixed
 * (PK → FK → AK → NN → UQ) so a modeller's eye learns a consistent
 * reading sequence across every entity in the model.
 *
 * Taste grounding: Erwin / ER Studio render these exact codes in the
 * entity-box flag column; seeing them here signals "not a toy" to a
 * 15-year practitioner on first glance.
 */

export interface AttributeFlagCellProps {
  isPk: boolean;
  isFk: boolean;
  isNn: boolean;
  isUq: boolean;
  altKeyGroup: string | null;
}

export function AttributeFlagCell({ isPk, isFk, isNn, isUq, altKeyGroup }: AttributeFlagCellProps) {
  // Base class shared by every code chip — keeps kerning and padding
  // consistent so a row with just `PK` still aligns with a row that
  // shows `PK FK AK1 NN UQ`.
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
          title={`Alt key group ${altKeyGroup}`}
        >
          {altKeyGroup}
        </span>
      ) : null}
      {isNn ? (
        <span
          data-testid="attribute-flag-nn"
          className={`${base} text-text-secondary/70`}
          title="NOT NULL"
        >
          NN
        </span>
      ) : null}
      {isUq ? (
        <span
          data-testid="attribute-flag-uq"
          className={`${base} text-text-secondary/70`}
          title="UNIQUE"
        >
          UQ
        </span>
      ) : null}
    </span>
  );
}
