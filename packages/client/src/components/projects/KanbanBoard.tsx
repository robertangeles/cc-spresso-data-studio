import { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { KanbanColumn as KanbanColumnComponent } from './KanbanColumn';
import { KanbanCardModal } from './KanbanCardModal';
import type {
  KanbanColumn,
  KanbanCard,
  UpdateCardDTO,
  MoveCardDTO,
  CreateColumnDTO,
  UpdateColumnDTO,
} from '@cc/shared';

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onCreateCard: (columnId: string, title: string) => Promise<void>;
  onUpdateCard: (cardId: string, data: UpdateCardDTO) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  onMoveCard: (cardId: string, data: MoveCardDTO) => Promise<void>;
  onReorderCards: (cardIds: string[], columnId: string) => Promise<void>;
  onAddColumn: (data: CreateColumnDTO) => Promise<void>;
  onUpdateColumn: (columnId: string, data: UpdateColumnDTO) => Promise<void>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onReorderColumns: (columnIds: string[]) => Promise<void>;
  onCardClick: (card: KanbanCard) => void;
}

export function KanbanBoard({
  columns,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onReorderCards,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  onReorderColumns: _onReorderColumns,
  onCardClick,
}: KanbanBoardProps) {
  void _onReorderColumns;
  // Drag-and-drop state
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Card detail modal
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);

  // Add column UI
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  const handleCardDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    setDragCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropColumnId(columnId);
  }, []);

  const handleCardDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Determine if cursor is in top or bottom half of the card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? index : index + 1;
    setDropIndex(insertIndex);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropColumnId(null);
      setDropIndex(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (targetColumnId: string) => {
      if (!dragCardId) return;

      const currentDropIndex = dropIndex;
      setDropColumnId(null);
      setDropIndex(null);
      setDragCardId(null);

      // Find the card and its source column
      let sourceColumnId: string | null = null;
      let draggedCard: KanbanCard | null = null;

      for (const col of columns) {
        const found = col.cards?.find((c) => c.id === dragCardId);
        if (found) {
          sourceColumnId = col.id;
          draggedCard = found;
          break;
        }
      }

      if (!draggedCard || !sourceColumnId) return;

      const targetColumn = columns.find((c) => c.id === targetColumnId);
      if (!targetColumn) return;

      const targetCards = [...(targetColumn.cards || [])];

      if (sourceColumnId === targetColumnId) {
        // Same column reorder
        const oldIndex = targetCards.findIndex((c) => c.id === dragCardId);
        if (oldIndex === -1) return;

        targetCards.splice(oldIndex, 1);

        let insertAt = currentDropIndex ?? targetCards.length;
        if (insertAt > oldIndex) insertAt = Math.max(0, insertAt - 1);
        insertAt = Math.min(insertAt, targetCards.length);

        targetCards.splice(insertAt, 0, draggedCard);

        const newOrder = targetCards.map((c) => c.id);
        await onReorderCards(newOrder, targetColumnId);
      } else {
        // Cross-column move
        const insertAt = currentDropIndex ?? targetCards.length;
        await onMoveCard(dragCardId, {
          columnId: targetColumnId,
          sortOrder: Math.min(insertAt, targetCards.length),
        });
      }
    },
    [dragCardId, dropIndex, columns, onReorderCards, onMoveCard],
  );

  const handleCardClick = useCallback(
    (card: KanbanCard) => {
      setSelectedCard(card);
      onCardClick(card);
    },
    [onCardClick],
  );

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    await onAddColumn({ name: newColumnName.trim() });
    setNewColumnName('');
    setIsAddingColumn(false);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full items-start">
          {columns.map((column) => (
            <KanbanColumnComponent
              key={column.id}
              column={column}
              isDragOver={dropColumnId === column.id}
              onDragOver={(e) => handleColumnDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(column.id);
              }}
              onCardDragStart={handleCardDragStart}
              onCardDragOver={handleCardDragOver}
              dragCardId={dragCardId}
              dropIndex={dropColumnId === column.id ? dropIndex : null}
              onCreateCard={async (title) => onCreateCard(column.id, title)}
              onCardClick={handleCardClick}
              onUpdateColumn={(data) => onUpdateColumn(column.id, data)}
              onDeleteColumn={() => onDeleteColumn(column.id)}
            />
          ))}

          {/* Add column button */}
          {isAddingColumn ? (
            <div className="min-w-[280px] max-w-[320px] flex-shrink-0 rounded-xl bg-surface-2/50 backdrop-blur-sm border border-white/5 p-3 space-y-2">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Column name..."
                autoFocus
                className="w-full rounded-lg border border-border-subtle bg-surface-3/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.15)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') setIsAddingColumn(false);
                }}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  disabled={!newColumnName.trim()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50 hover:bg-accent-hover transition-colors"
                >
                  Add column
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingColumn(false)}
                  className="rounded-lg p-1.5 text-text-tertiary hover:text-text-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingColumn(true)}
              className="min-w-[280px] flex-shrink-0 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-surface-2/20 backdrop-blur-sm px-4 py-8 text-sm text-text-tertiary hover:text-text-secondary hover:border-white/20 hover:bg-surface-2/30 transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Add column
            </button>
          )}
        </div>
      </div>

      {/* Card detail modal */}
      <KanbanCardModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={async (data) => {
          if (!selectedCard) return;
          await onUpdateCard(selectedCard.id, data);
        }}
        onDelete={async () => {
          if (!selectedCard) return;
          await onDeleteCard(selectedCard.id);
          setSelectedCard(null);
        }}
      />
    </div>
  );
}
