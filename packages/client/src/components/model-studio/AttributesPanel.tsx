import { useState } from 'react';
import { Check, GripVertical, KeyRound, Link2, Plus, Trash2 } from 'lucide-react';
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
import {
  lintAttribute,
  type AttributeCreate,
  type AttributeUpdate,
  type Layer,
  type NamingLintRule,
} from '@cc/shared';
import type { AttributeSummary } from '../../hooks/useAttributes';

/**
 * Step 5 — Attribute editor inside the EntityDetailPanel.
 *
 * Each row is independently editable (name, data_type, PK/FK/NN/UQ
 * flags). Drag-and-drop handle reorders the rows and calls back with
 * the new ordered id list; the server dense-rewrites ordinal_position
 * to 1..N atomically.
 *
 * Add-row form at the bottom creates a new attribute with sensible
 * defaults (uuid + PK on the first attribute of an empty entity,
 * otherwise varchar nullable).
 */

export interface AttributesPanelProps {
  attributes: AttributeSummary[];
  layer: Layer;
  isBusy: boolean;
  onCreate: (dto: AttributeCreate) => Promise<AttributeSummary>;
  onUpdate: (attrId: string, patch: AttributeUpdate) => Promise<AttributeSummary>;
  onDelete: (attrId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}

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

export function AttributesPanel({
  attributes,
  layer,
  isBusy,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: AttributesPanelProps) {
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
      await onCreate({
        name: trimmed,
        dataType: isFirst ? 'uuid' : newDataType,
        isPrimaryKey: isFirst,
      });
      setNewName('');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  const ids = attributes.map((a) => a.id);

  return (
    <section data-testid="attributes-panel">
      <h4 className="mb-2 text-xs font-medium text-text-secondary">
        Attributes
        <span className="ml-2 text-text-secondary/50">{attributes.length}</span>
      </h4>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {attributes.map((attr) => (
              <AttributeRow
                key={attr.id}
                attr={attr}
                layer={layer}
                isBusy={isBusy}
                onUpdate={(patch) => onUpdate(attr.id, patch)}
                onDelete={() => onDelete(attr.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {attributes.length === 0 && (
        <p className="mt-2 text-[11px] text-text-secondary/60 italic">
          No attributes yet. Add one below — the first will be a uuid primary key by default.
        </p>
      )}

      <div className="mt-3 rounded-md border border-white/10 bg-surface-1/60 p-2">
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
            className="flex-1 rounded-md bg-surface-1/60 border border-white/10 px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
            autoComplete="off"
          />
          <select
            data-testid="attribute-add-type"
            value={newDataType}
            onChange={(e) => setNewDataType(e.target.value)}
            className="rounded-md bg-surface-1/60 border border-white/10 px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
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
    </section>
  );
}

interface RowProps {
  attr: AttributeSummary;
  layer: Layer;
  isBusy: boolean;
  onUpdate: (patch: AttributeUpdate) => Promise<AttributeSummary>;
  onDelete: () => Promise<void>;
}

function AttributeRow({ attr, layer, isBusy, onUpdate, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: attr.id,
  });
  const [draftName, setDraftName] = useState(attr.name);
  const [draftType, setDraftType] = useState(attr.dataType ?? 'varchar');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Live lint for inline feedback. Server response on save is authoritative.
  const liveLint: NamingLintRule[] = lintAttribute(draftName, layer, {
    dataType: draftType,
    length: attr.length,
    precision: attr.precision,
    scale: attr.scale,
  });
  const nameViolation = liveLint.find((l) => l.severity === 'violation');

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

  async function commitType(next: string) {
    setDraftType(next);
    if (next === (attr.dataType ?? 'varchar')) return;
    await onUpdate({ dataType: next });
  }

  async function toggle(field: 'isPrimaryKey' | 'isForeignKey' | 'isNullable' | 'isUnique') {
    await onUpdate({ [field]: !attr[field] });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="attribute-row"
      data-attribute-id={attr.id}
      className={[
        'group rounded-md border border-white/10 bg-surface-1/50 p-1.5',
        attr.isPrimaryKey
          ? 'border-accent/40 shadow-[0_0_8px_rgba(255,214,10,0.2)]'
          : 'hover:border-white/20',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Drag to reorder"
          data-testid="attribute-drag-handle"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-text-secondary hover:text-text-primary active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <input
          data-testid="attribute-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          disabled={isBusy}
          className={[
            'min-w-0 flex-1 rounded-md bg-transparent border px-1.5 py-1 text-xs text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-accent/50',
            nameViolation
              ? 'border-amber-400/50 underline decoration-amber-400 decoration-wavy underline-offset-4'
              : 'border-transparent hover:border-white/10',
          ].join(' ')}
        />

        <select
          data-testid="attribute-datatype"
          value={draftType}
          onChange={(e) => void commitType(e.target.value)}
          disabled={isBusy}
          className="shrink-0 rounded-md bg-surface-1/60 border border-white/10 px-1.5 py-1 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-1 flex items-center gap-1.5 pl-5">
        <Pill
          active={attr.isPrimaryKey}
          testId="attribute-pk-toggle"
          onClick={() => toggle('isPrimaryKey')}
          icon={<KeyRound className="h-3 w-3" />}
          label="PK"
          title="Primary key"
        />
        <Pill
          active={attr.isForeignKey}
          testId="attribute-fk-toggle"
          onClick={() => toggle('isForeignKey')}
          icon={<Link2 className="h-3 w-3" />}
          label="FK"
          title="Foreign key"
        />
        <Pill
          active={!attr.isNullable}
          testId="attribute-nn-toggle"
          onClick={() => toggle('isNullable')}
          label="NN"
          title="NOT NULL (disabled = allow null)"
        />
        <Pill
          active={attr.isUnique}
          testId="attribute-uq-toggle"
          onClick={() => toggle('isUnique')}
          label="UQ"
          title="Unique"
        />

        {confirmDelete ? (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="attribute-delete-confirm"
              onClick={() => {
                void onDelete();
                setConfirmDelete(false);
              }}
              className="rounded-md border border-red-400/50 bg-red-500/30 px-1.5 py-0.5 text-[10px] text-red-50 hover:bg-red-500/45"
            >
              <Check className="inline h-3 w-3" /> Delete
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Delete attribute"
            data-testid="attribute-delete-button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-md p-0.5 text-text-secondary/60 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {nameViolation && (
        <p className="mt-1 pl-5 text-[10px] text-amber-300">{nameViolation.message}</p>
      )}
    </li>
  );
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
  testId: string;
  icon?: React.ReactNode;
}

function Pill({ active, onClick, label, title, testId, icon }: PillProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
        active
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-white/10 bg-transparent text-text-secondary hover:border-white/20 hover:text-text-primary',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}
