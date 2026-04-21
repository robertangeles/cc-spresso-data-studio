import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Braces,
  FileText,
  History as HistoryIcon,
  Link2,
  Maximize2,
  Minimize2,
  Palette,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  lintRelationshipName,
  type Cardinality,
  type Layer,
  type NamingLintRule,
  type Relationship,
} from '@cc/shared';
import type { EntitySummary } from '../../hooks/useEntities';
import { isVersionConflictResult } from '../../hooks/useRelationships';
import { useToast } from '../ui/Toast';
import { StubTab } from './attribute-tabs/StubTab';
import { formatAuditEvent, type AuditEvent } from '../../lib/auditFormatter';

/**
 * Step 6 — RelationshipPanel (Erwin-style property sheet for a rel).
 *
 * Layout mirrors EntityEditor:
 *   - compact  420 px right slide-in
 *   - expanded 960 px right slide-in (≥1280 viewport)
 *   - modal (full-screen portal) on narrower viewports when expanded
 *
 * Tabs:
 *   - General (wired)       name + src/tgt (readonly) + layer (readonly)
 *   - Cardinality (wired)   src + tgt cardinality + identifying toggle
 *   - Governance (stub)     Ships in Step 8
 *   - Audit (wired)         change_log history rendered via auditFormatter
 *   - Rules (stub)          Ships in Step 11
 *   - Appearance (stub)     Ships in Step 11
 *
 * All mutations go through `onUpdate` (→ useRelationships.update) which
 * returns `VersionConflictResult` on 409; we surface a toast and
 * refetch (caller's `onConflict` cb) so the user isn't left on a stale
 * view.
 */

const EXPAND_BREAKPOINT = 1280;
const STORAGE_KEY = 'model-studio.relationship-panel-width';

type WidthMode = 'compact' | 'expanded';

function readStoredWidth(): WidthMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'compact' || raw === 'expanded') return raw;
  } catch {
    /* localStorage may be disabled */
  }
  return 'expanded';
}

export interface RelationshipPanelProps {
  relationship: Relationship | null;
  entities: EntitySummary[];
  /** History events for this rel — parent loads on open. */
  auditEvents: AuditEvent[];
  auditLoading: boolean;
  onClose: () => void;
  onUpdate: (
    relId: string,
    input: {
      name?: string | null;
      /** Step 6 Direction A — inverse verb phrase (target → source). */
      inverseName?: string | null;
      sourceCardinality?: Cardinality;
      targetCardinality?: Cardinality;
      isIdentifying?: boolean;
    },
    clientVersion: number,
  ) => Promise<Relationship | { conflict: true; serverVersion: number | null }>;
  onDelete: (relId: string) => Promise<void>;
  onConflict: () => void;
}

export function RelationshipPanel(props: RelationshipPanelProps) {
  const { relationship } = props;
  const [width, setWidth] = useState<WidthMode>(readStoredWidth);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? EXPAND_BREAKPOINT : window.innerWidth,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, width);
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!relationship) return null;

  const isNarrow = viewportWidth < EXPAND_BREAKPOINT;
  const modalMode = width === 'expanded' && isNarrow;
  const effectiveWidth: WidthMode = modalMode ? 'expanded' : width;

  const shell = (
    <RelationshipShell
      {...props}
      relationship={relationship}
      width={effectiveWidth}
      modalMode={modalMode}
      onToggleWidth={() => setWidth((w) => (w === 'compact' ? 'expanded' : 'compact'))}
      onCollapseToCompact={() => setWidth('compact')}
    />
  );

  if (modalMode) {
    return createPortal(
      <div
        className="fixed inset-0 z-40 flex"
        role="dialog"
        aria-modal="true"
        aria-label="Relationship editor"
      >
        <button
          type="button"
          aria-label="Close editor"
          onClick={props.onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <div className="relative z-10 ml-auto flex h-full w-full flex-col">{shell}</div>
      </div>,
      document.body,
    );
  }
  return shell;
}

// ────────────────────────────────────────────────────────────────────
// Shell
// ────────────────────────────────────────────────────────────────────

type TabId = 'general' | 'cardinality' | 'governance' | 'audit' | 'rules' | 'appearance';

interface TabMeta {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  wired: boolean;
  tooltip: string;
}

const TABS: TabMeta[] = [
  {
    id: 'general',
    label: 'General',
    icon: <Link2 className="h-3 w-3" />,
    wired: true,
    tooltip: 'Core fields — name + source/target entities + layer.',
  },
  {
    id: 'cardinality',
    label: 'Cardinality',
    icon: <Braces className="h-3 w-3" />,
    wired: true,
    tooltip: 'Crow’s-foot / IDEF1X cardinality + identifying toggle.',
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: <ShieldCheck className="h-3 w-3" />,
    wired: false,
    tooltip: 'Steward, retention policy, compliance tags — ships Step 8.',
  },
  {
    id: 'audit',
    label: 'Audit',
    icon: <HistoryIcon className="h-3 w-3" />,
    wired: true,
    tooltip: 'Change history for this relationship.',
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: <FileText className="h-3 w-3" />,
    wired: false,
    tooltip: 'Referential-action + trigger logic — ships Step 11.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette className="h-3 w-3" />,
    wired: false,
    tooltip: 'Edge colour / stroke overrides — ships Step 11.',
  },
];

interface ShellProps extends RelationshipPanelProps {
  relationship: Relationship;
  width: WidthMode;
  modalMode: boolean;
  onToggleWidth: () => void;
  onCollapseToCompact: () => void;
}

function RelationshipShell(props: ShellProps) {
  const {
    relationship,
    entities,
    auditEvents,
    auditLoading,
    width,
    modalMode,
    onToggleWidth,
    onCollapseToCompact,
    onClose,
    onUpdate,
    onDelete,
    onConflict,
  } = props;

  const [activeTab, setActiveTab] = useState<TabId>('general');

  // Reset to General on rel switch so the open tab is never stale.
  useEffect(() => {
    setActiveTab('general');
  }, [relationship.id]);

  const source = useMemo(
    () => entities.find((e) => e.id === relationship.sourceEntityId) ?? null,
    [entities, relationship.sourceEntityId],
  );
  const target = useMemo(
    () => entities.find((e) => e.id === relationship.targetEntityId) ?? null,
    [entities, relationship.targetEntityId],
  );

  const frameClass = modalMode
    ? 'h-full w-full'
    : width === 'expanded'
      ? 'absolute right-0 top-0 h-full w-[960px]'
      : 'absolute right-0 top-0 h-full w-[420px]';

  return (
    <aside
      data-testid="relationship-panel"
      data-width={width}
      data-modal={modalMode ? 'true' : 'false'}
      className={[
        frameClass,
        'z-30 flex flex-col border-l border-white/10 bg-surface-2/85 backdrop-blur-xl',
        modalMode ? '' : 'transition-[width] duration-200 ease-out',
        'shadow-[-12px_0_40px_rgba(0,0,0,0.5)]',
      ].join(' ')}
    >
      <PanelHeader
        relationship={relationship}
        source={source}
        target={target}
        width={width}
        modalMode={modalMode}
        onToggleWidth={onToggleWidth}
        onCollapseToCompact={onCollapseToCompact}
        onClose={onClose}
        onDelete={() => void onDelete(relationship.id)}
      />

      <TabStrip active={activeTab} onSelect={setActiveTab} />

      <div
        className="flex-1 overflow-auto"
        role="tabpanel"
        aria-labelledby={`rel-tab-${activeTab}`}
      >
        <ActiveTabContent
          activeTab={activeTab}
          relationship={relationship}
          source={source}
          target={target}
          auditEvents={auditEvents}
          auditLoading={auditLoading}
          onUpdate={onUpdate}
          onConflict={onConflict}
        />
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────

const LAYER_TONE: Record<Layer, string> = {
  conceptual: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
  logical: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  physical: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
};

function PanelHeader({
  relationship,
  source,
  target,
  width,
  modalMode,
  onToggleWidth,
  onCollapseToCompact,
  onClose,
  onDelete,
}: {
  relationship: Relationship;
  source: EntitySummary | null;
  target: EntitySummary | null;
  width: WidthMode;
  modalMode: boolean;
  onToggleWidth: () => void;
  onCollapseToCompact: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <header className="shrink-0 border-b border-white/10 bg-accent/[0.04] px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,214,10,0.2)]">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-[10px] font-bold uppercase tracking-wider ${LAYER_TONE[relationship.layer]}`}
          title={`${relationship.layer} layer`}
        >
          <Link2 className="h-3 w-3" />
          Relationship
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-secondary/60">
          {relationship.sourceCardinality}:{relationship.targetCardinality}
          {relationship.isIdentifying ? ' · identifying' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {modalMode && (
            <IconButton label="Back to canvas" onClick={onCollapseToCompact}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton
            label={width === 'expanded' ? 'Collapse to compact' : 'Expand'}
            onClick={onToggleWidth}
          >
            {width === 'expanded' ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 font-mono text-sm">
        <span className="font-semibold text-text-primary">{source?.name ?? '?'}</span>
        <span className="text-accent">→</span>
        <span className="font-semibold text-text-primary">{target?.name ?? '?'}</span>
        {relationship.name && (
          <span className="ml-auto rounded-sm border border-white/10 bg-surface-1/60 px-1.5 py-0.5 text-[10px] text-text-secondary">
            {relationship.name}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        {!confirmDelete ? (
          <button
            type="button"
            data-testid="relationship-delete-button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
            title="Remove this relationship. If identifying, propagated PK attributes will be unwound."
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="relationship-delete-confirm"
              onClick={() => onDelete()}
              className="rounded-md border border-red-400/50 bg-red-500/25 px-2 py-1 text-[11px] font-semibold text-red-50 hover:bg-red-500/40"
            >
              Delete relationship
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────
// Tab strip (mirrors AttributePropertyEditor)
// ────────────────────────────────────────────────────────────────────

function TabStrip({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Relationship properties"
      className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-white/10 bg-surface-2/60 backdrop-blur-sm"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const titleText = tab.wired ? tab.tooltip : `${tab.tooltip} (Ships later.)`;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`rel-tab-${tab.id}`}
            aria-selected={isActive}
            title={titleText}
            onClick={() => onSelect(tab.id)}
            data-testid={`rel-tab-${tab.id}`}
            className={[
              'group relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors',
              isActive
                ? 'text-accent'
                : tab.wired
                  ? 'text-text-secondary hover:text-text-primary'
                  : 'text-text-secondary/40 hover:text-text-secondary/60',
            ].join(' ')}
          >
            <span className={isActive ? 'text-accent' : 'text-text-secondary/60'}>{tab.icon}</span>
            {tab.label}
            {!tab.wired && (
              <span
                className="ml-0.5 inline-flex h-1 w-1 rounded-full bg-amber-400/50"
                title="Ships later"
              />
            )}
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-t bg-accent shadow-[0_0_8px_rgba(255,214,10,0.6)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Tab content router
// ────────────────────────────────────────────────────────────────────

function ActiveTabContent({
  activeTab,
  relationship,
  source,
  target,
  auditEvents,
  auditLoading,
  onUpdate,
  onConflict,
}: {
  activeTab: TabId;
  relationship: Relationship;
  source: EntitySummary | null;
  target: EntitySummary | null;
  auditEvents: AuditEvent[];
  auditLoading: boolean;
  onUpdate: RelationshipPanelProps['onUpdate'];
  onConflict: () => void;
}) {
  switch (activeTab) {
    case 'general':
      return (
        <GeneralRelTab
          relationship={relationship}
          source={source}
          target={target}
          onUpdate={onUpdate}
          onConflict={onConflict}
        />
      );
    case 'cardinality':
      return (
        <CardinalityRelTab
          relationship={relationship}
          onUpdate={onUpdate}
          onConflict={onConflict}
        />
      );
    case 'audit':
      return <AuditRelTab events={auditEvents} isLoading={auditLoading} />;
    case 'governance':
      return (
        <StubTab
          title="Governance"
          description="Steward assignment, retention policy, compliance tags for this relationship."
          shipsIn="Step 8"
        />
      );
    case 'rules':
      return (
        <StubTab
          title="Rules"
          description="Referential-action + trigger logic (ON DELETE CASCADE / RESTRICT, custom enforcement)."
          shipsIn="Step 11"
        />
      );
    case 'appearance':
      return (
        <StubTab
          title="Appearance"
          description="Edge colour / stroke-style overrides live in metadata JSONB."
          shipsIn="Step 11"
        />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// General tab
// ────────────────────────────────────────────────────────────────────

function GeneralRelTab({
  relationship,
  source,
  target,
  onUpdate,
  onConflict,
}: {
  relationship: Relationship;
  source: EntitySummary | null;
  target: EntitySummary | null;
  onUpdate: RelationshipPanelProps['onUpdate'];
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState<string>(relationship.name ?? '');
  const [inverseName, setInverseName] = useState<string>(relationship.inverseName ?? '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(relationship.name ?? '');
    setInverseName(relationship.inverseName ?? '');
  }, [relationship.id, relationship.name, relationship.inverseName]);

  const lint: NamingLintRule[] = lintRelationshipName(name, relationship.layer);
  const warning = lint.find((l) => l.severity === 'violation' || l.severity === 'warning');

  const commitName = useCallback(async () => {
    const next = name.trim() ? name.trim() : null;
    if (next === (relationship.name ?? null)) return;
    const result = await onUpdate(relationship.id, { name: next }, relationship.version);
    if (isVersionConflictResult(result)) {
      onConflict();
      return;
    }
    toast('Relationship updated', 'success');
  }, [name, relationship, onUpdate, onConflict, toast]);

  const commitInverseName = useCallback(async () => {
    const next = inverseName.trim() ? inverseName.trim() : null;
    if (next === (relationship.inverseName ?? null)) return;
    const result = await onUpdate(relationship.id, { inverseName: next }, relationship.version);
    if (isVersionConflictResult(result)) {
      onConflict();
      return;
    }
    toast('Inverse verb phrase updated', 'success');
  }, [inverseName, relationship, onUpdate, onConflict, toast]);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Row label="Source entity" hint="Readonly — drag the source handle to move.">
        <div className="rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 font-mono text-sm text-text-primary">
          {source?.name ?? relationship.sourceEntityId}
        </div>
      </Row>
      <Row label="Target entity" hint="Readonly — drag the target handle to move.">
        <div className="rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 font-mono text-sm text-text-primary">
          {target?.name ?? relationship.targetEntityId}
        </div>
      </Row>
      <Row label="Layer" hint="Rels can't cross layers — change the entities instead.">
        <div className="rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 font-mono text-xs uppercase tracking-widest text-text-secondary">
          {relationship.layer}
        </div>
      </Row>
      <Row label="Name" hint="Optional — cardinality carries the semantics.">
        <input
          ref={nameRef}
          data-testid="relationship-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="e.g. owns, belongs_to_customer"
          autoComplete="off"
          className={[
            'w-full rounded-md border bg-surface-1/40 px-2.5 py-1.5 font-mono text-sm text-text-primary',
            'focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40',
            warning
              ? 'border-amber-400/50 underline decoration-amber-400 decoration-wavy underline-offset-4'
              : 'border-white/10',
          ].join(' ')}
        />
        {warning && (
          <p data-testid="rel-name-lint" className="mt-1 text-[10px] text-amber-300">
            {warning.message}
          </p>
        )}
      </Row>
      <Row
        label="Inverse verb phrase (optional)"
        hint="Reads the relationship from target → source."
      >
        <input
          data-testid="relationship-inverse-name-input"
          value={inverseName}
          onChange={(e) => setInverseName(e.target.value)}
          onBlur={commitInverseName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="e.g. is_placed_by, is_managed_by"
          autoComplete="off"
          className="w-full rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 font-mono text-sm text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </Row>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Cardinality tab
// ────────────────────────────────────────────────────────────────────

const CARDINALITY_OPTIONS: Array<{ value: Cardinality; label: string }> = [
  { value: 'one', label: 'One (exactly)' },
  { value: 'many', label: 'Many' },
  { value: 'zero_or_one', label: 'Zero or one' },
  { value: 'zero_or_many', label: 'Zero or many' },
  { value: 'one_or_many', label: 'One or many' },
];

function CardinalityRelTab({
  relationship,
  onUpdate,
  onConflict,
}: {
  relationship: Relationship;
  onUpdate: RelationshipPanelProps['onUpdate'];
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const commit = useCallback(
    async (
      patch: Partial<{
        sourceCardinality: Cardinality;
        targetCardinality: Cardinality;
        isIdentifying: boolean;
      }>,
    ) => {
      setBusy(true);
      try {
        const result = await onUpdate(relationship.id, patch, relationship.version);
        if (isVersionConflictResult(result)) {
          onConflict();
          return;
        }
        if (typeof patch.isIdentifying === 'boolean') {
          toast(
            patch.isIdentifying
              ? 'Marked as identifying — PK attributes propagated'
              : 'Unmarked as identifying — propagated attributes removed',
            'success',
          );
        } else {
          toast('Cardinality updated', 'success');
        }
      } finally {
        setBusy(false);
      }
    },
    [relationship, onUpdate, onConflict, toast],
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Row label="Source cardinality" hint="How many source rows participate.">
        <select
          data-testid="rel-source-cardinality"
          disabled={busy}
          value={relationship.sourceCardinality}
          onChange={(e) => void commit({ sourceCardinality: e.target.value as Cardinality })}
          className="w-full rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
        >
          {CARDINALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Target cardinality" hint="How many target rows participate.">
        <select
          data-testid="rel-target-cardinality"
          disabled={busy}
          value={relationship.targetCardinality}
          onChange={(e) => void commit({ targetCardinality: e.target.value as Cardinality })}
          className="w-full rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
        >
          {CARDINALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row
        label="Identifying"
        hint="Propagates PK attrs in a single transaction. Unmark to unwind."
      >
        <label
          className={[
            'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer',
            relationship.isIdentifying
              ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_12px_rgba(255,214,10,0.15)]'
              : 'border-white/10 bg-surface-1/40 text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <input
            data-testid="rel-identifying-toggle"
            type="checkbox"
            disabled={busy}
            checked={relationship.isIdentifying}
            onChange={(e) => void commit({ isIdentifying: e.target.checked })}
            className="h-3.5 w-3.5 accent-yellow-400"
          />
          <span>
            {relationship.isIdentifying
              ? 'Identifying — source PK propagates to target'
              : 'Non-identifying relationship'}
          </span>
        </label>
      </Row>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Audit tab
// ────────────────────────────────────────────────────────────────────

function AuditRelTab({ events, isLoading }: { events: AuditEvent[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-secondary">
        Loading history…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-text-secondary/60">
        No audit events yet.
      </div>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-white/5 px-4 py-2" data-testid="rel-audit-list">
      {events.map((ev) => {
        const lines = formatAuditEvent(ev);
        return (
          <li key={ev.id} className="py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary/60">
              {new Date(ev.createdAt).toLocaleString()}
            </div>
            <ul className="mt-1 space-y-0.5">
              {lines.map((l, i) => (
                <li key={i} className="text-xs text-text-primary">
                  {l}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared atoms
// ────────────────────────────────────────────────────────────────────

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
          {label}
        </span>
        {hint && <span className="text-[10px] text-text-secondary/50">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
    >
      {children}
    </button>
  );
}
