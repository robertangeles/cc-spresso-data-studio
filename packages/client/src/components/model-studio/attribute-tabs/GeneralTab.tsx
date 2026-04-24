import { useEffect, useState } from 'react';
import type { AttributeUpdate } from '@cc/shared';
import type { AttributeSummary } from '../../../hooks/useAttributes';

/**
 * General tab — the inline-editable property sheet for a single
 * attribute. Mirrors what Erwin shows on its General tab: name,
 * business name, definition, default value, ordinal position. Drives
 * `onUpdate` per field on blur (auto-save; matches the rest of the app).
 */

export interface GeneralTabProps {
  attribute: AttributeSummary;
  onUpdate: (patch: AttributeUpdate) => Promise<AttributeSummary>;
  /** Labels keyed by AK group name (e.g. `{AK1: "NI number"}`). Shared
   *  across all columns in the same group — stored on the ENTITY, not
   *  the attribute. Undefined when the panel hasn't threaded the
   *  entity context. */
  entityAltKeyLabels?: Record<string, string> | null;
  /** PATCH the entity's altKeyLabels map. Called by the Purpose input
   *  on blur. Undefined when the panel hasn't threaded the entity
   *  context — in that case the Purpose input is disabled. */
  onUpdateEntityAltKeyLabels?: (labels: Record<string, string>) => Promise<void> | void;
}

export function GeneralTab({
  attribute,
  onUpdate,
  entityAltKeyLabels,
  onUpdateEntityAltKeyLabels,
}: GeneralTabProps) {
  // Name + Data Type + PK/FK/NN/UQ/Classification live in the grid
  // above (inline-editable). General hosts the rest — and, per Rob's
  // direction, the short Definition lives here too (grid column is
  // a read-only preview). The richer Markdown editor ships on the
  // Documentation tab when Step 11 polish lands.
  const currentAkGroup = attribute.altKeyGroup ?? null;
  const currentAkLabel = (currentAkGroup ? entityAltKeyLabels?.[currentAkGroup] : '') ?? '';

  const [draft, setDraft] = useState({
    businessName: attribute.businessName ?? '',
    defaultValue: attribute.defaultValue ?? '',
    description: attribute.description ?? '',
    akLabel: currentAkLabel,
  });

  // Reset draft whenever the selected attribute OR its AK group
  // changes. Keyed on attribute.id + group so the Purpose input
  // reflects the right group's label without wiping in-progress
  // typing on the other fields mid-edit.
  useEffect(() => {
    setDraft({
      businessName: attribute.businessName ?? '',
      defaultValue: attribute.defaultValue ?? '',
      description: attribute.description ?? '',
      akLabel: (attribute.altKeyGroup ? entityAltKeyLabels?.[attribute.altKeyGroup] : '') ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attribute.id, attribute.altKeyGroup, entityAltKeyLabels]);

  async function commit<K extends keyof typeof draft>(field: K, raw: string) {
    const trimmed = raw.trim();
    const current = (attribute[field as keyof AttributeSummary] ?? '') as string;
    if ((trimmed || null) === (current || null)) return;
    await onUpdate({ [field]: trimmed || null } as AttributeUpdate);
  }

  return (
    <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
      <FieldSlot
        label="Business name"
        hint="Human-readable label. Free-form."
        value={draft.businessName}
        onChange={(v) => setDraft((d) => ({ ...d, businessName: v }))}
        onBlur={() => commit('businessName', draft.businessName)}
        placeholder="e.g. Customer identifier"
      />
      <FieldSlot
        label="Default value"
        hint="Raw literal or expression; no validation at MVP."
        value={draft.defaultValue}
        onChange={(v) => setDraft((d) => ({ ...d, defaultValue: v }))}
        onBlur={() => commit('defaultValue', draft.defaultValue)}
        placeholder="e.g. gen_random_uuid()"
        mono
      />

      <div className="sm:col-span-2">
        <FieldLabel
          label="Definition"
          hint="Short prose. Shown read-only in the grid column above."
        />
        <textarea
          data-testid="attribute-general-definition"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          onBlur={() => commit('description', draft.description)}
          rows={4}
          placeholder="What does this attribute represent? What business rules apply?"
          className="w-full resize-y rounded-md border border-white/10 bg-surface-1/50 px-3 py-2 text-xs leading-relaxed text-text-primary placeholder:text-text-secondary/40 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </div>

      <div className="sm:col-span-2">
        <FieldLabel label="Alt Key Group" hint="Composite business key — NN + UQ auto-enforced." />
        <select
          data-testid="attribute-general-ak-picker"
          value={attribute.altKeyGroup ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const next = raw === '' ? null : raw;
            if ((next ?? null) === (attribute.altKeyGroup ?? null)) return;
            void onUpdate({ altKeyGroup: next });
          }}
          style={{ colorScheme: 'dark' }}
          className="w-full rounded-md border border-white/10 bg-surface-1/50 px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
        >
          <option value="" className="bg-surface-2 text-text-primary">
            None
          </option>
          <option value="AK1" className="bg-surface-2 text-text-primary">
            AK1
          </option>
          <option value="AK2" className="bg-surface-2 text-text-primary">
            AK2
          </option>
          <option value="AK3" className="bg-surface-2 text-text-primary">
            AK3
          </option>
        </select>
        <p className="mt-1 text-[10px] text-text-secondary/60">
          Columns sharing an alt key group form one composite business key. NN + UQ are
          auto-enforced.
        </p>
      </div>

      {/* Optional purpose label, stored on the ENTITY keyed by AK group
          so every column in the same group reads the same label. Shows
          as a tooltip on the AK badge + becomes the DDL constraint
          name in Step 9 export. Disabled until an AK group is picked
          OR the panel isn't threaded with the entity writer. */}
      <div className="sm:col-span-2">
        <FieldLabel
          label="Purpose (optional)"
          hint="Describes what this alt key enforces. Shows in tooltip + DDL constraint name."
        />
        <input
          data-testid="attribute-general-ak-label"
          value={draft.akLabel}
          disabled={!currentAkGroup || !onUpdateEntityAltKeyLabels}
          onChange={(e) => setDraft((d) => ({ ...d, akLabel: e.target.value }))}
          onBlur={async () => {
            if (!currentAkGroup || !onUpdateEntityAltKeyLabels) return;
            const trimmed = draft.akLabel.trim();
            const existing = entityAltKeyLabels?.[currentAkGroup] ?? '';
            if (trimmed === existing) return;
            const next: Record<string, string> = { ...(entityAltKeyLabels ?? {}) };
            if (trimmed) next[currentAkGroup] = trimmed;
            else delete next[currentAkGroup];
            await onUpdateEntityAltKeyLabels(next);
          }}
          placeholder={
            currentAkGroup ? `e.g. "NI number — UK tax identifier"` : 'Pick an alt key group first'
          }
          title={!currentAkGroup ? 'Pick an alt key group first' : undefined}
          className={[
            'w-full rounded-md border border-white/10 bg-surface-1/50 px-2.5 py-1.5 text-xs text-text-primary',
            'placeholder:text-text-secondary/40',
            'focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        />
      </div>

      <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-md border border-white/5 bg-surface-1/30 p-2">
        <MetaCell label="Ordinal" value={attribute.ordinalPosition} />
        <MetaCell
          label="Created"
          value={new Date(attribute.createdAt).toLocaleDateString()}
          title={new Date(attribute.createdAt).toLocaleString()}
        />
        <MetaCell
          label="Updated"
          value={new Date(attribute.updatedAt).toLocaleDateString()}
          title={new Date(attribute.updatedAt).toLocaleString()}
        />
      </div>
    </div>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <span className="text-[10px] uppercase tracking-wider text-text-secondary/80">{label}</span>
      {hint && <span className="text-[10px] text-text-secondary/50">{hint}</span>}
    </div>
  );
}

function FieldSlot({
  label,
  hint,
  value,
  onChange,
  onBlur,
  placeholder,
  mono,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={[
          'w-full rounded-md border border-white/10 bg-surface-1/50 px-2.5 py-1.5 text-xs text-text-primary',
          'placeholder:text-text-secondary/40',
          'focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  );
}

function MetaCell({
  label,
  value,
  title,
}: {
  label: string;
  value: string | number;
  title?: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-text-secondary/60">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] text-text-primary" title={title}>
        {value}
      </div>
    </div>
  );
}
