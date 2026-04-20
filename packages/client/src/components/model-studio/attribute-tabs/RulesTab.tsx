import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { AttributeUpdate } from '@cc/shared';
import type { AttributeSummary } from '../../../hooks/useAttributes';

/**
 * Step 5 follow-up — Rules tab.
 *
 * Free-form transformation logic / business rules for an attribute.
 * Users paste a SQL expression, an ETL snippet, or plain pseudocode
 * that explains how this attribute is derived. Backed by the
 * `transformation_logic` TEXT column on data_model_attributes.
 *
 * Deliberately low-ceremony: a mono textarea, auto-save on blur,
 * no syntax highlighting (yet). Keep it light until someone proves
 * they need an editor surface.
 */

export interface RulesTabProps {
  attribute: AttributeSummary;
  onUpdate: (patch: AttributeUpdate) => Promise<AttributeSummary>;
}

export function RulesTab({ attribute, onUpdate }: RulesTabProps) {
  const [draft, setDraft] = useState(attribute.transformationLogic ?? '');

  // Reset the draft when a different attribute is selected. Keyed on
  // attribute.id ONLY — syncing on transformationLogic would wipe the
  // user's in-progress edit every time the server round-trip completes.
  useEffect(() => {
    setDraft(attribute.transformationLogic ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attribute.id]);

  async function commit() {
    const trimmed = draft.trim();
    const current = attribute.transformationLogic ?? '';
    if ((trimmed || null) === (current || null)) return;
    await onUpdate({ transformationLogic: trimmed || null });
  }

  return (
    <div className="flex h-full flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5 text-accent" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
            Transformation logic / business rules
          </span>
        </div>
        <span className="text-[10px] text-text-secondary/50">
          Paste SQL, pseudocode, or prose — mono auto-saved on blur
        </span>
      </div>

      <textarea
        data-testid="rules-tab-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        placeholder={`-- e.g.\nCOALESCE(nullif(trim(upper(a.email)), ''), 'unknown@example.test')\n\n-- or in English\nLast 4 digits of the customer's primary phone number; formatted per ITU E.164.`}
        className="min-h-0 flex-1 resize-none rounded-md border border-white/10 bg-surface-1/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary placeholder:text-text-secondary/35 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
      />

      <p className="text-[10px] text-text-secondary/50">
        {attribute.transformationLogic
          ? `${attribute.transformationLogic.length.toLocaleString()} chars stored`
          : 'Empty — no transformation logic documented for this attribute yet.'}
      </p>
    </div>
  );
}
