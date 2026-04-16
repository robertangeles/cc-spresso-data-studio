import { useState, useRef } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { KanbanCard as KanbanCardComponent } from './KanbanCard';
import type { KanbanColumn as KanbanColumnType, KanbanCard, UpdateColumnDTO } from '@cc/shared';

interface KanbanColumnProps {
  column: KanbanColumnType;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onCardDragStart: (e: React.DragEvent, cardId: string) => void;
  onCardDragOver: (e: React.DragEvent, index: number) => void;
  dragCardId: string | null;
  dropIndex: number | null;
  onCreateCard: (title: string) => Promise<void>;
  onCardClick: (card: KanbanCard) => void;
  onUpdateColumn: (data: UpdateColumnDTO) => void;
  onDeleteColumn: () => void;
}

export function KanbanColumn({
  column,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragOver,
  dragCardId,
  dropIndex,
  onCreateCard,
  onCardClick,
  onUpdateColumn,
  onDeleteColumn,
}: KanbanColumnProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const [showMenu, setShowMenu] = useState(false);
  const [quickAddValue, setQuickAddValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const cards = column.cards || [];
  const colorDot = column.color || '#ffd60a';

  const handleRename = () => {
    if (editName.trim() && editName !== column.name) {
      onUpdateColumn({ name: editName.trim() });
    }
    setIsEditingName(false);
  };

  const handleQuickAdd = async () => {
    if (!quickAddValue.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateCard(quickAddValue.trim());
      setQuickAddValue('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className={`flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0 rounded-xl bg-surface-2/50 backdrop-blur-sm border transition-all duration-200 ${
        isDragOver ? 'border-accent/40 ring-2 ring-accent/20 scale-[1.01]' : 'border-white/5'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorDot }}
          />
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setEditName(column.name);
                  setIsEditingName(false);
                }
              }}
              className="flex-1 min-w-0 rounded border border-border-default bg-surface-3 px-1.5 py-0.5 text-sm font-bold text-text-primary focus:border-accent focus:outline-none"
              autoFocus
            />
          ) : (
            <h3
              className="text-sm font-bold text-text-primary truncate cursor-pointer hover:text-accent transition-colors"
              onDoubleClick={() => {
                setEditName(column.name);
                setIsEditingName(true);
              }}
            >
              {column.name}
            </h3>
          )}
          <span className="rounded-full bg-surface-3/80 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary min-w-[20px] text-center flex-shrink-0">
            {cards.length}
          </span>
        </div>

        {/* Kebab menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="rounded p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg bg-surface-2 border border-border-subtle shadow-dark-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setEditName(column.name);
                    setIsEditingName(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-3 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onDeleteColumn();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete column
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]">
        {cards.length === 0 && !dragCardId && (
          <div className="flex flex-col items-center justify-center py-8 opacity-40">
            <p className="text-[10px] text-text-tertiary">No cards yet</p>
          </div>
        )}

        {cards.map((card, index) => (
          <div key={card.id} className="relative">
            {/* Drop indicator line -- shows above this card */}
            {dragCardId && dragCardId !== card.id && isDragOver && dropIndex === index && (
              <div className="h-0.5 bg-accent rounded-full mx-1 -mt-1 mb-1 shadow-[0_0_6px_rgba(255,214,10,0.4)]" />
            )}
            <div
              draggable
              onDragStart={(e) => onCardDragStart(e, card.id)}
              onDragEnd={() => {
                // Parent handles cleanup
              }}
              onDragOver={(e) => onCardDragOver(e, index)}
              className="cursor-grab active:cursor-grabbing"
            >
              <KanbanCardComponent
                card={card}
                onDragStart={(e) => onCardDragStart(e, card.id)}
                isDragging={dragCardId === card.id}
                onClick={() => onCardClick(card)}
              />
            </div>
            {/* Drop indicator line -- shows below the last card */}
            {dragCardId &&
              dragCardId !== card.id &&
              isDragOver &&
              dropIndex === index + 1 &&
              index === cards.length - 1 && (
                <div className="h-0.5 bg-accent rounded-full mx-1 mt-1 shadow-[0_0_6px_rgba(255,214,10,0.4)]" />
              )}
          </div>
        ))}
      </div>

      {/* Quick-add input at bottom */}
      <div className="px-2 pb-2">
        <div className="group">
          <input
            type="text"
            value={quickAddValue}
            onChange={(e) => setQuickAddValue(e.target.value)}
            placeholder="Add a card..."
            className="w-full rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary/60 focus:border-border-subtle focus:bg-surface-3/30 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.08)] transition-all duration-200"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleQuickAdd();
              if (e.key === 'Escape') {
                setQuickAddValue('');
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {quickAddValue.trim() && (
            <div className="flex items-center gap-1 mt-1 px-1">
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={isCreating}
                className="rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-surface-0 disabled:opacity-50 hover:bg-accent-hover transition-colors"
              >
                {isCreating ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setQuickAddValue('')}
                className="rounded p-0.5 text-text-tertiary hover:text-text-secondary"
              >
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
