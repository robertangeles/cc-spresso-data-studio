import { useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, KeyRound, Link2, Plus, Trash2 } from 'lucide-react';
import { lintAttribute, type AttributeCreate, type AttributeUpdate, type Layer } from '@cc/shared';
import type { AttributeSummary } from '../../hooks/useAttributes';

/**
 * Step 5 follow-up — Erwin-style attribute grid. Replaces the stacked-
 * card AttributesPanel.
 *
 * Visual grammar:
 *   - Real <table> for a11y. Tight 28px row height.
 *   - Sticky glass header that stays visible as rows scroll.
 *   - Zebra stripes at extremely low opacity — adds vertical rhythm
 *     without distraction.
 *   - Selected row: left amber rail + faint amber wash. Clicked rows
 *     drive the property editor below (AttributePropertyEditor).
 *   - PK rows get an amber underline on Name for visual scanability.
 *   - Data Type cell uses font-mono — data architects read types more
 *     than they read prose.
 *
 * Keyboard:
 *   - Up/Down: next/prev row via dnd-kit keyboard sensor (drag mode)
 *   - Tab: advance through editable cells
 *   - Enter in Name: commit + move down one row
 *   - Space on drag handle: enter drag mode (dnd-kit)
 *
 * dnd-kit announcements are wired so screen readers get drag state.
 */

const DATA_TYPES = [
  'uuid',
  'varchar',
  'text',
  'integer',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'timestamp',
  'jsonb',
];

export interface AttributeGridProps {
  attributes: AttributeSummary[];
  layer: Layer;
  selectedAttrId: string | null;
  isBusy: boolean;
  onSelect: (attrId: string) => void;
  onCreate: (dto: AttributeCreate) => Promise<AttributeSummary>;
  onUpdate: (attrId: string, patch: AttributeUpdate) => Promise<AttributeSummary>;
  onDelete: (attrId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}

const DND_ANNOUNCEMENTS = {
  onDragStart({ active }: { active: { id: string | number } }) {
    return `Picked up attribute ${active.id}. Use arrow keys to move, space to drop.`;
  },
  onDragOver({
    active,
    over,
  }: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) {
    if (!over) return `Attribute ${active.id} is no longer over a droppable.`;
    return `Attribute ${active.id} moved over ${over.id}.`;
  },
  onDragEnd({
    active,
    over,
  }: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) {
    if (!over) return `Attribute ${active.id} dropped. No change.`;
    return `Attribute ${active.id} dropped onto ${over.id}.`;
  },
  onDragCancel({ active }: { active: { id: string | number } }) {
    return `Drag cancelled for attribute ${active.id}.`;
  },
};

export function AttributeGrid({
  attributes,
  layer,
  selectedAttrId,
  isBusy,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: AttributeGridProps) {
  const [newName, setNewName] = useState('');
  const [newDataType, setNewDataType] = useState('varchar');
  const [addError, setAddError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = attributes.findIndex((a) => a.id === active.id);
    const newIndex = attributes.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(attributes, oldIndex, newIndex).map((a) => a.id);
    await onReorder(nextIds);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAddError(null);
    try {
      const isFirst = attributes.length === 0;
      const created = await onCreate({
        name: trimmed,
        dataType: isFirst ? 'uuid' : newDataType,
        isPrimaryKey: isFirst,
      });
      setNewName('');
      onSelect(created.id);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  const ids = attributes.map((a) => a.id);

  return (
    <div className="flex h-full flex-col" data-testid="attribute-grid">
      <div className="relative flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: DND_ANNOUNCEMENTS }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <table className="w-full border-separate border-spacing-0 font-sans">
              <thead>
                <tr className="sticky top-0 z-10 bg-surface-2/90 backdrop-blur-xl">
                  <Th className="w-7" />
                  <Th>Name</Th>
                  <Th className="w-[120px]">Data Type</Th>
                  <Th className="w-8 text-center" title="Primary key">
                    PK
                  </Th>
                  <Th className="w-8 text-center" title="Foreign key">
                    FK
                  </Th>
                  <Th className="w-8 text-center" title="Not null">
                    NN
                  </Th>
                  <Th className="w-8 text-center" title="Unique">
                    UQ
                  </Th>
                  <Th>Definition</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {attributes.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-6 text-center text-[11px] italic text-text-secondary/60"
                    >
                      No attributes yet. Add one below — the first will be a uuid primary key by
                      default.
                    </td>
                  </tr>
                )}
                {attributes.map((attr) => (
                  <AttributeRow
                    key={attr.id}
                    attr={attr}
                    layer={layer}
                    selected={attr.id === selectedAttrId}
                    isBusy={isBusy}
                    onSelect={() => onSelect(attr.id)}
                    onUpdate={(patch) => onUpdate(attr.id, patch)}
                    onDelete={() => onDelete(attr.id)}
                  />
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>

      {/* Inline add row — always visible below the scroll region. */}
      <div className="shrink-0 border-t border-white/10 bg-surface-1/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            data-testid="attribute-add-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={attributes.length === 0 ? 'id' : 'new_column'}
            className="flex-1 rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 font-mono text-xs text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
            autoComplete="off"
          />
          <select
            data-testid="attribute-add-type"
            value={newDataType}
            onChange={(e) => setNewDataType(e.target.value)}
            className="rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 font-mono text-[11px] text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
          >
            {DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="attribute-add-button"
            onClick={() => {
              void handleAdd();
            }}
            disabled={!newName.trim() || isBusy}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/15 px-2 py-1 text-[11px] font-medium text-accent hover:from-accent/25 hover:to-amber-500/25 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {addError && (
          <p data-testid="attribute-add-error" className="mt-1 text-[11px] text-red-300">
            {addError}
          </p>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  className,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      className={[
        'border-b border-white/10 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary/80',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

// ────────────────────────────────────────────────────────────────────
// Row
// ────────────────────────────────────────────────────────────────────

interface RowProps {
  attr: AttributeSummary;
  layer: Layer;
  selected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onUpdate: (patch: AttributeUpdate) => Promise<AttributeSummary>;
  onDelete: () => Promise<void>;
}

function AttributeRow({ attr, layer, selected, isBusy, onSelect, onUpdate, onDelete }: RowProps) {
  const {
    attributes: dndAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: attr.id });
  const [draftName, setDraftName] = useState(attr.name);
  const [draftDefinition, setDraftDefinition] = useState(attr.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const liveLint = lintAttribute(draftName, layer, {
    dataType: attr.dataType,
    length: attr.length,
    precision: attr.precision,
    scale: attr.scale,
  });
  const nameViolation = liveLint.find((l) => l.severity === 'violation');
  const nameWarning = liveLint.find((l) => l.severity === 'warning');

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  async function commitName() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === attr.name) return;
    await onUpdate({ name: trimmed });
  }

  async function commitDataType(next: string) {
    if (next === (attr.dataType ?? '')) return;
    await onUpdate({ dataType: next || null });
  }

  async function commitDefinition() {
    const trimmed = draftDefinition.trim();
    const current = attr.description ?? '';
    if ((trimmed || null) === (current || null)) return;
    await onUpdate({ description: trimmed || null });
  }

  async function toggle(field: 'isPrimaryKey' | 'isForeignKey' | 'isNullable' | 'isUnique') {
    await onUpdate({ [field]: !attr[field] });
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-testid="attribute-row"
      data-attribute-id={attr.id}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      className={[
        'group cursor-pointer transition-colors',
        // Zebra stripe; barely-there rhythm.
        'even:bg-white/[0.012]',
        selected
          ? 'bg-accent/[0.06] shadow-[inset_2px_0_0_0_rgb(255,214,10)]'
          : 'hover:bg-white/[0.02]',
      ].join(' ')}
    >
      {/* Drag handle */}
      <td className="border-b border-white/5 px-1 py-1 align-middle">
        <button
          type="button"
          aria-label={`Drag attribute ${attr.name} to reorder`}
          data-testid="attribute-drag-handle"
          {...dndAttributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex h-5 w-5 cursor-grab touch-none items-center justify-center rounded text-text-secondary/60 hover:bg-white/5 hover:text-text-primary active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </td>

      {/* Name */}
      <td className="border-b border-white/5 px-2 py-0.5 align-middle">
        <input
          data-testid="attribute-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraftName(attr.name);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          disabled={isBusy}
          onClick={(e) => e.stopPropagation()}
          title={nameViolation?.message ?? nameWarning?.message}
          className={[
            'w-full min-w-0 rounded-sm border bg-transparent px-1.5 py-1 font-mono text-xs text-text-primary',
            'focus:border-accent/40 focus:bg-surface-1/70 focus:outline-none',
            nameViolation
              ? 'border-amber-400/40 underline decoration-amber-400 decoration-wavy underline-offset-4'
              : nameWarning
                ? 'border-transparent underline decoration-amber-300/60 decoration-dotted underline-offset-4'
                : 'border-transparent hover:border-white/10',
          ].join(' ')}
        />
      </td>

      {/* Data Type */}
      <td className="border-b border-white/5 px-2 py-0.5 align-middle">
        <select
          data-testid="attribute-datatype"
          value={attr.dataType ?? ''}
          onChange={(e) => void commitDataType(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={isBusy}
          className="w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11px] text-text-primary hover:border-white/10 focus:border-accent/40 focus:bg-surface-1/70 focus:outline-none"
        >
          <option value="">—</option>
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>

      {/* PK */}
      <td className="border-b border-white/5 px-1 py-0.5 text-center align-middle">
        <FlagToggle
          label="PK"
          testId="attribute-pk-toggle"
          active={attr.isPrimaryKey}
          accent="amber"
          icon={<KeyRound className="h-3 w-3" />}
          onClick={() => toggle('isPrimaryKey')}
        />
      </td>

      {/* FK */}
      <td className="border-b border-white/5 px-1 py-0.5 text-center align-middle">
        <FlagToggle
          label="FK"
          testId="attribute-fk-toggle"
          active={attr.isForeignKey}
          accent="indigo"
          icon={<Link2 className="h-3 w-3" />}
          onClick={() => toggle('isForeignKey')}
        />
      </td>

      {/* NN — inverted: "NN" highlighted when isNullable === false */}
      <td className="border-b border-white/5 px-1 py-0.5 text-center align-middle">
        <FlagToggle
          label="NN"
          testId="attribute-nn-toggle"
          active={!attr.isNullable}
          onClick={() => toggle('isNullable')}
        />
      </td>

      {/* UQ */}
      <td className="border-b border-white/5 px-1 py-0.5 text-center align-middle">
        <FlagToggle
          label="UQ"
          testId="attribute-uq-toggle"
          active={attr.isUnique}
          onClick={() => toggle('isUnique')}
        />
      </td>

      {/* Definition (single-line) */}
      <td className="border-b border-white/5 px-2 py-0.5 align-middle">
        <input
          value={draftDefinition}
          onChange={(e) => setDraftDefinition(e.target.value)}
          onBlur={commitDefinition}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraftDefinition(attr.description ?? '');
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={isBusy}
          placeholder="—"
          className="w-full min-w-0 truncate rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-[11px] italic text-text-secondary placeholder:text-text-secondary/30 hover:border-white/10 focus:border-accent/40 focus:bg-surface-1/70 focus:not-italic focus:text-text-primary focus:outline-none"
        />
      </td>

      {/* Delete */}
      <td className="border-b border-white/5 px-1 py-0.5 align-middle">
        {confirmDelete ? (
          <button
            type="button"
            data-testid="attribute-delete-confirm"
            onClick={(e) => {
              e.stopPropagation();
              void onDelete();
              setConfirmDelete(false);
            }}
            className="rounded-sm border border-red-400/50 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-100 hover:bg-red-500/35"
          >
            Confirm
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Delete attribute ${attr.name}`}
            data-testid="attribute-delete-button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-text-secondary/40 opacity-0 transition-opacity hover:bg-white/5 hover:text-red-300 group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </td>
    </tr>
  );
}

function FlagToggle({
  label,
  active,
  onClick,
  testId,
  icon,
  accent = 'neutral',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
  icon?: React.ReactNode;
  accent?: 'amber' | 'indigo' | 'neutral';
}) {
  const activeClass =
    accent === 'amber'
      ? 'border-accent/50 bg-accent/15 text-accent shadow-[0_0_8px_rgba(255,214,10,0.25)]'
      : accent === 'indigo'
        ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';

  return (
    <button
      type="button"
      aria-pressed={active}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        'inline-flex h-5 w-5 items-center justify-center rounded-sm border font-mono text-[9px] font-bold tracking-wider transition-colors',
        active ? activeClass : 'border-white/10 text-text-secondary/50 hover:text-text-primary',
      ].join(' ')}
      title={label}
    >
      {icon ?? label}
    </button>
  );
}
