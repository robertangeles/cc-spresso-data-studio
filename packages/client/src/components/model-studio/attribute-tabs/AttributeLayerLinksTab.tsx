import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Link as LinkIcon, AlertCircle } from 'lucide-react';
import type { AttributeLink, Layer, ProjectionChainResponse } from '@cc/shared';
import type { AttributeSummary } from '../../../hooks/useAttributes';

/**
 * Step 7 EXP-4 — AttributeLayerLinksTab.
 *
 * Wires the previously-stubbed `'layerLinks'` tab in
 * `AttributePropertyEditor`. Surface: row-per-partner-entity dropdown
 * picker. The focused attribute can be linked to ONE attribute on each
 * layer-linked partner entity; picking a row's dropdown either creates
 * a new link, swaps an existing one (delete-then-create), or clears it.
 *
 * Anchor patterns:
 *   - `RelationshipPanel` Key Columns (row-by-row dropdown picker UX)
 *   - `LayerLinkSuggestionsPanel` (row-state machine: idle/busy/done/failed)
 *
 * Empty state fires when there are no layer-linked partners — the user
 * has to link entities first via the canvas LinkedObjectsPanel before
 * column-grain linking is meaningful.
 */

const LAYER_LABEL: Record<Layer, string> = {
  conceptual: 'Conceptual',
  logical: 'Logical',
  physical: 'Physical',
};

type RowState = 'idle' | 'busy' | 'done' | 'failed';

export interface AttributeLayerLinksTabProps {
  entityId: string;
  entityLayer: Layer;
  attribute: AttributeSummary;
  /** Projection chain for the focused entity. Provides the partner
   *  entity list (chain.nodes excluding this entity). Null while the
   *  parent is loading the chain or if the entity has no links yet. */
  chain: ProjectionChainResponse | null;
  /** Per-entity attribute cache from useAttributes — drives the
   *  target-attribute dropdown for each partner row. */
  attributesByEntity: Record<string, AttributeSummary[]>;
  /** Every attribute_link the parent has loaded so far. The tab
   *  filters this to find links touching `attribute.id`. */
  links: AttributeLink[];
  /** Trigger fresh fetches scoped to the focused attribute. Called
   *  on mount + on attribute change. The hook merges into its cache
   *  so this is safe to fire repeatedly. */
  loadByParent(attrId: string): Promise<unknown>;
  loadByChild(attrId: string): Promise<unknown>;
  /** Create a fresh link (parentAttrId → childAttrId). Server enforces
   *  that the owning entities are layer-linked. */
  onCreate(parentAttrId: string, childAttrId: string): Promise<unknown>;
  onDelete(linkId: string): Promise<void>;
}

interface PartnerRow {
  partnerEntityId: string;
  partnerEntityName: string;
  partnerLayer: Layer;
  /** The currently-linked attribute on this partner (if any). The
   *  link object is what the dropdown's "remove" path passes to
   *  `onDelete` for the link id. */
  existingLink: AttributeLink | null;
  /** The id of the partner-side attribute on the existing link, or
   *  empty string when no link exists. The link's direction (parent
   *  vs child) depends on which side you authored it from, so we
   *  pick whichever endpoint ISN'T the focused attribute. */
  currentPartnerAttrId: string;
  /** All attributes available on this partner — populates the
   *  dropdown options. */
  partnerAttrs: AttributeSummary[];
}

export function AttributeLayerLinksTab({
  entityId,
  entityLayer,
  attribute,
  chain,
  attributesByEntity,
  links,
  loadByParent,
  loadByChild,
  onCreate,
  onDelete,
}: AttributeLayerLinksTabProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});

  // Pull both directions on mount/attribute change. The hook caches +
  // dedupes so this is cheap; without it the `links` prop won't reflect
  // links where the focused attribute is the CHILD (e.g. a physical
  // column with a logical parent).
  useEffect(() => {
    void loadByParent(attribute.id);
    void loadByChild(attribute.id);
  }, [attribute.id, loadByParent, loadByChild]);

  // Build one row per partner entity in the chain (excluding self).
  const rows: PartnerRow[] = useMemo(() => {
    if (!chain) return [];
    return chain.nodes
      .filter((n) => n.entityId !== entityId)
      .map<PartnerRow>((partner) => {
        const existingLink =
          links.find(
            (l) =>
              (l.parentId === attribute.id && l.childEntityId === partner.entityId) ||
              (l.childId === attribute.id && l.parentEntityId === partner.entityId),
          ) ?? null;
        // The partner attribute is whichever endpoint ISN'T the
        // focused attribute. This makes the dropdown read the same
        // pre-selected value regardless of which side authored the
        // original link.
        const currentPartnerAttrId = existingLink
          ? existingLink.parentId === attribute.id
            ? existingLink.childId
            : existingLink.parentId
          : '';
        return {
          partnerEntityId: partner.entityId,
          partnerEntityName: partner.entityName,
          partnerLayer: partner.layer,
          existingLink,
          currentPartnerAttrId,
          partnerAttrs: attributesByEntity[partner.entityId] ?? [],
        };
      });
  }, [chain, entityId, attribute.id, links, attributesByEntity]);

  const setStatus = useCallback((key: string, state: RowState, err?: string) => {
    setRowState((prev) => ({ ...prev, [key]: state }));
    setRowError((prev) => ({ ...prev, [key]: err }));
  }, []);

  /** Pick handler for a partner-entity row. Three transitions are
   *  possible:
   *    - new attr selected, no prior link        → CREATE
   *    - new attr selected, prior link exists    → DELETE old + CREATE new
   *    - "— not linked —" selected, prior exists → DELETE
   *    - "— not linked —" with no prior          → no-op
   *  Direction: the focused attribute is always the CONSUMER side of
   *  the new link. We flip parent/child based on layer ordering: in a
   *  greenfield-style chain the parent layer is upstream of the child.
   *  For MVP we keep it simple — always treat the focused attribute as
   *  the parent of the partner attribute. This matches the convention
   *  the rest of Lane 4 uses (ProjectToModal: source=parent). */
  const handlePick = useCallback(
    async (row: PartnerRow, nextPartnerAttrId: string) => {
      const k = row.partnerEntityId;
      const prior = row.existingLink;
      const wantsClear = nextPartnerAttrId === '';

      // No-op short-circuits: clearing a row that has no link, or
      // re-picking the same partner attribute that's already linked.
      if (wantsClear && !prior) return;
      if (!wantsClear && row.currentPartnerAttrId === nextPartnerAttrId) return;

      setStatus(k, 'busy');
      try {
        if (prior) {
          await onDelete(prior.id);
        }
        if (!wantsClear) {
          // Convention: the focused attribute is always the link's
          // parent. Editing from the other side flips direction —
          // semantically still a mapping, just normalised over time.
          await onCreate(attribute.id, nextPartnerAttrId);
        }
        setStatus(k, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        setStatus(k, 'failed', msg);
      }
    },
    [attribute.id, onCreate, onDelete, setStatus],
  );

  if (!chain || rows.length === 0) {
    return (
      <div data-testid="attribute-layer-links-empty" className="px-5 py-6">
        <div className="flex items-start gap-3 rounded-md border border-white/10 bg-surface-1/40 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary/70" />
          <div className="space-y-1 text-[12px]">
            <p className="font-semibold text-text-primary">No layer-linked partners.</p>
            <p className="text-text-secondary">
              Link this entity ({LAYER_LABEL[entityLayer]}) to an entity on another layer first —
              open the <span className="text-accent">Linked</span> panel in the page header and use{' '}
              <span className="text-accent">+ Link existing entity…</span>. Once an entity-level
              link exists, this tab will let you map attributes between them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="attribute-layer-links-tab" className="space-y-3 px-5 py-4">
      <header className="flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-accent" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
          Layer Links
        </h3>
        <span className="text-[10px] text-text-secondary/70">
          Map <span className="font-mono text-text-primary">{attribute.name}</span> to an attribute
          on each layer-linked partner entity.
        </span>
      </header>

      <ul className="divide-y divide-white/5 rounded-md border border-white/10 bg-surface-1/30">
        {rows.map((row) => {
          const k = row.partnerEntityId;
          const state = rowState[k] ?? 'idle';
          const err = rowError[k];
          return (
            <li
              key={k}
              data-testid={`attribute-link-row-${k}`}
              data-state={state}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-text-secondary/60">
                  {LAYER_LABEL[row.partnerLayer]}
                </span>
                <span className="font-mono text-xs font-semibold text-text-primary">
                  {row.partnerEntityName}
                </span>
              </div>
              <span className="text-text-secondary/40">→</span>
              <select
                data-testid={`attribute-link-select-${k}`}
                value={row.currentPartnerAttrId}
                disabled={state === 'busy' || row.partnerAttrs.length === 0}
                onChange={(e) => void handlePick(row, e.target.value)}
                className="min-w-[180px] rounded-md border border-white/10 bg-surface-2/70 px-2 py-1 text-[12px] text-text-primary focus:border-accent/40 focus:outline-none disabled:opacity-50"
              >
                <option value="">— not linked —</option>
                {row.partnerAttrs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <RowStatus state={state} />
              {state === 'failed' && err && (
                <p
                  data-testid={`attribute-link-error-${k}`}
                  className="basis-full text-[11px] text-red-300"
                >
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RowStatus({ state }: { state: RowState }) {
  if (state === 'busy')
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />;
  if (state === 'done')
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />;
  if (state === 'failed')
    return <AlertCircle className="h-3.5 w-3.5 text-red-300" aria-hidden="true" />;
  return null;
}
