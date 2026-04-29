import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  LayoutPanelTop,
  Maximize2,
  Minimize2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  lintIdentifier,
  type AttributeCreate,
  type AttributeUpdate,
  type Layer,
  type NamingLintRule,
} from '@cc/shared';
import type { EntitySummary } from '../../hooks/useEntities';
import type { AttributeHistoryEvent, AttributeSummary } from '../../hooks/useAttributes';
import { AttributeGrid } from './AttributeGrid';
import { AttributePropertyEditor, type AttributeLayerLinksBundle } from './AttributePropertyEditor';

/**
 * Step 5 follow-up — Erwin-style EntityEditor. Replaces
 * EntityDetailPanel (360px slide-in) + AttributesPanel (stacked cards).
 *
 * Layout (top → bottom):
 *   1. Header (entity layer + name/business/description + actions)
 *   2. AttributeGrid (sticky Erwin table)
 *   3. AttributePropertyEditor (tabbed, expanded-only)
 *
 * Width modes:
 *   • compact  — 420px right slide-in, header + grid only
 *   • expanded — 960px right slide-in on ≥1280px viewports;
 *                full-screen modal (portal) on <1280px
 *
 * The toggle persists to localStorage so a modeller's preference
 * carries between sessions.
 */

const EXPAND_BREAKPOINT = 1280;
const STORAGE_KEY = 'model-studio.entity-editor-width';
const DEFINITION_OPEN_KEY = 'model-studio.entity-editor-definition-open';

export interface EntityEditorProps {
  entity: EntitySummary | null;
  attributes: AttributeSummary[];
  attributesBusy: boolean;
  onClose: () => void;
  onUpdate: (patch: {
    name?: string;
    businessName?: string | null;
    description?: string | null;
    altKeyLabels?: Record<string, string>;
  }) => Promise<void>;
  onAutoDescribe: () => Promise<{ description: string }>;
  onDelete: (cascade: boolean) => Promise<void>;
  onAttributeCreate: (dto: AttributeCreate) => Promise<AttributeSummary>;
  onAttributeUpdate: (attrId: string, patch: AttributeUpdate) => Promise<AttributeSummary>;
  onAttributeDelete: (attrId: string) => Promise<void>;
  onAttributeReorder: (orderedIds: string[]) => Promise<void>;
  onGenerateSynthetic: () => void;
  onLoadHistory: (entityId: string, attrId: string) => Promise<AttributeHistoryEvent[]>;
  /** Step 7 EXP-4 — bundle for the Layer Links tab inside the
   *  property editor. Optional so legacy mounts that haven't plumbed
   *  it yet still render the stub. */
  attributeLinks?: AttributeLayerLinksBundle;
}

type WidthMode = 'compact' | 'expanded';

function readStoredWidth(): WidthMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'compact' || raw === 'expanded') return raw;
  } catch {
    // localStorage may be disabled; fall through to default
  }
  // Default to expanded — Spresso is a DMBOK-grade tool, architects
  // expect rich detail on open. Users can collapse to compact and the
  // preference persists.
  return 'expanded';
}

function readStoredDefinitionOpen(): boolean {
  try {
    return window.localStorage.getItem(DEFINITION_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function EntityEditor(props: EntityEditorProps) {
  const { entity } = props;
  const [width, setWidth] = useState<WidthMode>(readStoredWidth);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? EXPAND_BREAKPOINT : window.innerWidth,
  );
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null);

  // Persist the width preference.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, width);
    } catch {
      /* ignore */
    }
  }, [width]);

  // Track viewport width so narrow + expanded triggers modal mode.
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Default to the Entity General view (no attribute selected).
  // Preserve the user's row selection across re-renders; clear it only
  // when the entity changes or the selected attribute vanishes.
  // Keyed on `entity?.id` rather than the full `entity` object so the
  // effect doesn't re-fire every time the parent hands us a new
  // entity reference with identical data.
  useEffect(() => {
    if (!entity) {
      setSelectedAttrId(null);
      return;
    }
    const stillSelected = selectedAttrId && props.attributes.some((a) => a.id === selectedAttrId);
    if (!stillSelected && selectedAttrId !== null) setSelectedAttrId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.id, props.attributes, selectedAttrId]);

  if (!entity) return null;

  const isNarrow = viewportWidth < EXPAND_BREAKPOINT;
  const modalMode = width === 'expanded' && isNarrow;

  const effectiveWidth: WidthMode = modalMode ? 'expanded' : width;

  const shellContent = (
    <EditorShell
      {...props}
      entity={entity}
      width={effectiveWidth}
      modalMode={modalMode}
      selectedAttrId={selectedAttrId}
      onSelectAttr={setSelectedAttrId}
      onToggleWidth={() => setWidth((w) => (w === 'compact' ? 'expanded' : 'compact'))}
      onCollapseToCompact={() => setWidth('compact')}
    />
  );

  // On narrow viewports in expanded mode, render as a full-screen
  // modal via portal so the canvas isn't crushed underneath.
  if (modalMode) {
    return createPortal(
      <div
        className="fixed inset-0 z-40 flex"
        role="dialog"
        aria-modal="true"
        aria-label={`Entity editor — ${entity.name}`}
      >
        <button
          type="button"
          aria-label="Close editor"
          onClick={props.onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <div className="relative z-10 ml-auto flex h-full w-full flex-col">{shellContent}</div>
      </div>,
      document.body,
    );
  }

  return shellContent;
}

// ────────────────────────────────────────────────────────────────────
// Shell — renders header + grid + property editor. Shared by the
// inline (slide-in) and modal modes; modalMode only changes the outer
// frame and adds a "Back to canvas" affordance.
// ────────────────────────────────────────────────────────────────────

interface EditorShellProps extends EntityEditorProps {
  entity: EntitySummary;
  width: WidthMode;
  modalMode: boolean;
  selectedAttrId: string | null;
  onSelectAttr: (id: string) => void;
  onToggleWidth: () => void;
  onCollapseToCompact: () => void;
}

function EditorShell(props: EditorShellProps) {
  const {
    entity,
    attributes,
    attributesBusy,
    width,
    modalMode,
    selectedAttrId,
    onSelectAttr,
    onToggleWidth,
    onCollapseToCompact,
    onClose,
    onUpdate,
    onAutoDescribe,
    onDelete,
    onAttributeCreate,
    onAttributeUpdate,
    onAttributeDelete,
    onAttributeReorder,
    onGenerateSynthetic,
    onLoadHistory,
    attributeLinks,
  } = props;

  const selectedAttr = useMemo(
    () => attributes.find((a) => a.id === selectedAttrId) ?? null,
    [attributes, selectedAttrId],
  );

  // Frame sizing:
  //   - inline compact:  420px right-docked
  //   - inline expanded: 960px right-docked
  //   - modal mode:      full viewport width
  const frameClass = modalMode
    ? 'h-full w-full'
    : width === 'expanded'
      ? 'absolute right-0 top-0 h-full w-[960px]'
      : 'absolute right-0 top-0 h-full w-[420px]';

  return (
    <aside
      data-testid="entity-editor"
      data-width={width}
      data-modal={modalMode ? 'true' : 'false'}
      className={[
        frameClass,
        'z-30 flex flex-col border-l border-white/10 bg-surface-2/85 backdrop-blur-xl',
        modalMode ? '' : 'transition-[width] duration-200 ease-out',
        'shadow-[-12px_0_40px_rgba(0,0,0,0.5)]',
      ].join(' ')}
    >
      <EntityHeader
        entity={entity}
        width={width}
        modalMode={modalMode}
        onUpdate={onUpdate}
        onAutoDescribe={onAutoDescribe}
        onDelete={onDelete}
        onGenerateSynthetic={onGenerateSynthetic}
        onToggleWidth={onToggleWidth}
        onCollapseToCompact={onCollapseToCompact}
        onClose={onClose}
        attributeCount={attributes.length}
      />

      {/* Grid + property editor. The grid flex-basis is 40% when an
          attribute is selected (so the tabbed property editor below
          has proper real estate); otherwise the grid takes the full
          body — a placeholder under the grid wastes vertical space
          and visually "squeezes" the working surface. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={[
            'min-h-0 border-b border-white/10',
            width === 'expanded' && selectedAttr ? 'flex-[0_0_40%]' : 'flex-1',
          ].join(' ')}
        >
          <AttributeGrid
            attributes={attributes}
            layer={entity.layer as Layer}
            selectedAttrId={selectedAttrId}
            isBusy={attributesBusy}
            onSelect={onSelectAttr}
            onCreate={onAttributeCreate}
            onUpdate={onAttributeUpdate}
            onDelete={onAttributeDelete}
            onReorder={onAttributeReorder}
          />
        </div>

        {width === 'expanded' && selectedAttr && (
          <div className="min-h-0 flex-1">
            <AttributePropertyEditor
              entityId={entity.id}
              attribute={selectedAttr}
              onUpdate={onAttributeUpdate}
              loadHistory={onLoadHistory}
              entityAltKeyLabels={entity.altKeyLabels ?? {}}
              onUpdateEntityAltKeyLabels={(labels) => onUpdate({ altKeyLabels: labels })}
              attributeLinks={attributeLinks}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header — layer badge + name/business/description + action strip.
// ────────────────────────────────────────────────────────────────────

interface HeaderProps {
  entity: EntitySummary;
  width: WidthMode;
  modalMode: boolean;
  attributeCount: number;
  onUpdate: EntityEditorProps['onUpdate'];
  onAutoDescribe: EntityEditorProps['onAutoDescribe'];
  onDelete: EntityEditorProps['onDelete'];
  onGenerateSynthetic: EntityEditorProps['onGenerateSynthetic'];
  onToggleWidth: () => void;
  onCollapseToCompact: () => void;
  onClose: () => void;
}

const LAYER_BADGE: Record<
  'conceptual' | 'logical' | 'physical',
  { label: string; full: string; tone: string }
> = {
  conceptual: {
    label: 'C',
    full: 'Conceptual',
    tone: 'bg-blue-500/20 text-blue-200 border-blue-400/40 shadow-[0_0_12px_rgba(96,165,250,0.15)]',
  },
  logical: {
    label: 'L',
    full: 'Logical',
    tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
  },
  physical: {
    label: 'P',
    full: 'Physical',
    tone: 'bg-amber-500/20 text-amber-200 border-amber-400/40 shadow-[0_0_12px_rgba(252,211,77,0.2)]',
  },
};

function EntityHeader({
  entity,
  width,
  modalMode,
  attributeCount,
  onUpdate,
  onAutoDescribe,
  onDelete,
  onGenerateSynthetic,
  onToggleWidth,
  onCollapseToCompact,
  onClose,
}: HeaderProps) {
  const [draft, setDraft] = useState({
    name: entity.name,
    businessName: entity.businessName ?? '',
    description: entity.description ?? '',
  });
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Definition collapses to a 1-line preview by default so the attribute
  // grid below gets the prime vertical real estate. Senior modellers
  // live in the grid; the prose Definition is a reference field they
  // read/edit occasionally. State is persisted globally — once a user
  // pins the definition open they almost certainly want it that way
  // everywhere.
  const [definitionOpen, setDefinitionOpen] = useState(readStoredDefinitionOpen);
  const nameRef = useRef<HTMLInputElement>(null);
  const definitionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEFINITION_OPEN_KEY, String(definitionOpen));
    } catch {
      /* ignore */
    }
  }, [definitionOpen]);

  function expandDefinition() {
    setDefinitionOpen(true);
    queueMicrotask(() => definitionRef.current?.focus());
  }

  useEffect(() => {
    setDraft({
      name: entity.name,
      businessName: entity.businessName ?? '',
      description: entity.description ?? '',
    });
    setAutoError(null);
    setConfirmDelete(false);
    queueMicrotask(() => nameRef.current?.focus());
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveLint: NamingLintRule[] = lintIdentifier(draft.name, entity.layer as Layer);
  const violation = liveLint.find((l) => l.severity === 'violation');
  const badge = LAYER_BADGE[entity.layer as keyof typeof LAYER_BADGE];

  async function commitName() {
    if (draft.name.trim() === entity.name) return;
    await onUpdate({ name: draft.name.trim() });
  }
  async function commitBusiness() {
    const next = draft.businessName.trim() || null;
    if (next === (entity.businessName ?? null)) return;
    await onUpdate({ businessName: next });
  }
  async function commitDescription() {
    const next = draft.description.trim() || null;
    if (next === (entity.description ?? null)) return;
    await onUpdate({ description: next });
  }
  async function runAutoDescribe() {
    setAutoBusy(true);
    setAutoError(null);
    // Force-expand so the modeller can see the generated prose land
    // without hunting for it. This overrides a pinned-collapsed state
    // only for the current entity session — the persisted preference
    // kicks back in on the next open.
    setDefinitionOpen(true);
    try {
      const result = await onAutoDescribe();
      setDraft((d) => ({ ...d, description: result.description }));
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Auto-describe failed');
    } finally {
      setAutoBusy(false);
    }
  }

  function applySuggestion() {
    if (!violation?.suggestion) return;
    setDraft((d) => ({ ...d, name: violation.suggestion! }));
  }

  return (
    <header className="shrink-0 border-b border-white/10 px-4 py-3">
      {/* Row 1 — metadata strip: layer badge + entity-type subtitle + window controls */}
      <div className="flex items-center gap-2">
        <span
          className={[
            'inline-flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-[10px] font-bold uppercase tracking-wider',
            badge.tone,
          ].join(' ')}
          title={`${badge.full} layer`}
          aria-label={`${badge.full} layer`}
        >
          <span className="font-mono text-[11px]">{badge.label}</span>
          <span>{badge.full}</span>
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.2em] text-text-secondary/60"
          title="Entity scope. Attribute-level tabs open when you click an attribute row."
        >
          Entity · {attributeCount} attribute{attributeCount === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {modalMode && (
            <IconButton
              testId="entity-editor-back"
              label="Back to canvas"
              onClick={onCollapseToCompact}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton
            testId="entity-editor-width-toggle"
            label={
              width === 'expanded'
                ? 'Collapse to compact view (grid only)'
                : 'Expand for the tabbed property editor'
            }
            onClick={onToggleWidth}
          >
            {width === 'expanded' ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </IconButton>
          <IconButton testId="entity-editor-close" label="Close entity editor" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Row 2 — Name (technical identifier) */}
      <div className="mt-3">
        <FieldLabel
          label="Name"
          hint={
            entity.layer === 'physical'
              ? 'snake_case technical identifier'
              : 'Technical identifier (free-form on non-physical layers)'
          }
        />
        <input
          ref={nameRef}
          data-testid="entity-editor-name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="entity_name"
          autoComplete="off"
          title="Technical identifier for this entity. snake_case is required on the physical layer."
          className={[
            'w-full rounded-md border bg-surface-1/40 px-2.5 py-1.5 font-mono text-sm font-semibold text-text-primary',
            'placeholder:text-text-secondary/40',
            'focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40',
            violation
              ? 'border-amber-400/50 underline decoration-amber-400 decoration-wavy underline-offset-4'
              : 'border-white/10',
          ].join(' ')}
        />
        {violation && (
          <div
            data-testid="naming-lint-violation"
            className="mt-1 flex items-center gap-2 text-[10px] text-amber-300"
          >
            <span>{violation.message}</span>
            {violation.suggestion && (
              <button
                type="button"
                onClick={applySuggestion}
                className="rounded-sm border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-amber-200 hover:bg-amber-400/25"
              >
                Use &quot;{violation.suggestion}&quot;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Row 3 — Business name (human-readable label) */}
      <div className="mt-3">
        <FieldLabel label="Business name" hint="Human-readable label. Free-form." />
        <input
          data-testid="entity-editor-business-name"
          value={draft.businessName}
          onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
          onBlur={commitBusiness}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="e.g. Employee"
          title="Human-readable label shown to business stakeholders."
          className="w-full rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </div>

      {/* Row 4 — Definition (DMBOK term for the prose description).
          Collapsible: default state is a 1-line preview so the
          attribute grid gets vertical priority. Click the row to
          expand into the editable textarea. */}
      <div className="mt-3">
        {definitionOpen ? (
          <>
            <button
              type="button"
              data-testid="entity-editor-definition-toggle"
              aria-expanded="true"
              onClick={() => setDefinitionOpen(false)}
              title="Collapse the Definition to free up vertical space for the attribute grid"
              className="mb-1 -mx-1 flex w-[calc(100%+0.5rem)] items-baseline justify-between rounded-sm px-1 py-0.5 hover:bg-white/5"
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
                <ChevronDown className="h-3 w-3" />
                Definition
              </span>
              <span className="text-[10px] text-text-secondary/50">
                Prose; use Auto-describe to draft
              </span>
            </button>
            <textarea
              ref={definitionRef}
              data-testid="entity-editor-description"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              onBlur={commitDescription}
              rows={width === 'expanded' ? 3 : 2}
              placeholder="What real-world thing does this entity represent? What rules apply?"
              title="Plain-English description of what the entity represents and any business rules."
              className={[
                'w-full resize-y rounded-md border border-white/10 bg-surface-1/40 px-2.5 py-1.5 text-xs leading-relaxed text-text-primary',
                'placeholder:text-text-secondary/40',
                'focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40',
                autoBusy ? 'animate-pulse bg-surface-1/60' : '',
              ].join(' ')}
            />
            {autoError && (
              <p data-testid="auto-describe-error" className="mt-1 text-[10px] text-red-300">
                {autoError}
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            data-testid="entity-editor-definition-toggle"
            aria-expanded="false"
            onClick={expandDefinition}
            title={
              draft.description.trim()
                ? 'Expand to edit the full Definition'
                : 'Click to add a Definition'
            }
            className="group flex w-full items-start gap-2 rounded-md border border-white/10 bg-surface-1/30 px-2.5 py-1.5 text-left transition-colors hover:border-white/20 hover:bg-surface-1/60 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
          >
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-text-secondary/60 transition-colors group-hover:text-text-primary" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
                  Definition
                </span>
                {!draft.description.trim() && (
                  <span className="text-[10px] text-accent/70">+ Add</span>
                )}
              </div>
              <div
                className={[
                  'truncate text-xs leading-relaxed',
                  draft.description.trim()
                    ? 'text-text-secondary/80'
                    : 'italic text-text-secondary/40',
                ].join(' ')}
              >
                {draft.description.trim() || 'No definition yet. Click to add one.'}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Row 5 — action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ActionButton
          testId="auto-describe-button"
          onClick={runAutoDescribe}
          disabled={autoBusy}
          icon={<Sparkles className="h-3 w-3" />}
          tone="accent"
          title="Ask Claude to draft the entity's Definition based on its name + attributes."
        >
          {autoBusy ? 'Describing…' : 'Auto-describe'}
        </ActionButton>
        <ActionButton
          testId="synthetic-data-button"
          onClick={onGenerateSynthetic}
          disabled={attributeCount === 0}
          icon={<Database className="h-3 w-3" />}
          tone="accent"
          title={
            attributeCount === 0
              ? 'Add at least one attribute before generating synthetic data.'
              : 'Generate 10 fake-but-plausible preview rows for this entity.'
          }
        >
          Synthetic data
        </ActionButton>
        <div className="ml-auto">
          {!confirmDelete ? (
            <ActionButton
              testId="delete-entity-button"
              onClick={() => setConfirmDelete(true)}
              icon={<Trash2 className="h-3 w-3" />}
              tone="danger"
              title="Delete this entity. Dependent attributes and relationships cascade."
            >
              Delete
            </ActionButton>
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
                data-testid="delete-entity-confirm"
                onClick={() => onDelete(true)}
                className="rounded-md border border-red-400/50 bg-red-500/25 px-2 py-1 text-[11px] font-semibold text-red-50 hover:bg-red-500/40"
              >
                Delete + cascade
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ActionButton({
  testId,
  onClick,
  disabled,
  icon,
  tone,
  title,
  children,
}: {
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  tone: 'accent' | 'danger';
  title?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/40 bg-gradient-to-r from-accent/10 to-amber-500/10 text-accent hover:from-accent/20 hover:to-amber-500/20'
      : 'border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20';
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        toneClass,
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80">
        {label}
      </span>
      {hint && <span className="text-[10px] text-text-secondary/50">{hint}</span>}
    </div>
  );
}

function IconButton({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
    >
      {children}
    </button>
  );
}

// Visual-only export so the skill consumer can check the primary icon
// anchor matches what's used inside the header.
export { LayoutPanelTop as EntityEditorIcon };
