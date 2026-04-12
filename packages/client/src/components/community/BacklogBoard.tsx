import { useState, useMemo, useCallback } from 'react';
import { Plus, Loader2, Rocket, Hammer, CheckCircle2, X, ChevronUp } from 'lucide-react';
import { useBacklogItems } from '../../hooks/useBacklog';
import { BacklogItemCard } from './BacklogItem';
import type { BacklogItem } from '@cc/shared';

interface BacklogBoardProps {
  isAdmin?: boolean;
}

const COLUMNS: Array<{
  status: BacklogItem['status'];
  label: string;
  icon: typeof Rocket;
  color: string;
  bgColor: string;
}> = [
  {
    status: 'planned',
    label: 'Planned',
    icon: Rocket,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/8',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    icon: Hammer,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/8',
  },
  {
    status: 'shipped',
    label: 'Shipped',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/8',
  },
];

export function BacklogBoard({ isAdmin = false }: BacklogBoardProps) {
  const { items, loading, vote, removeVote, createItem, updateItem, deleteItem } =
    useBacklogItems();

  // Per-column inline add
  const [addingInColumn, setAddingInColumn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Drag-and-drop
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Card detail modal
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);

  const grouped = useMemo(() => {
    const result: Record<string, BacklogItem[]> = {
      planned: [],
      in_progress: [],
      shipped: [],
    };
    for (const item of items) {
      if (result[item.status]) {
        result[item.status].push(item);
      }
    }
    return result;
  }, [items]);

  const handleQuickAdd = async (status: string) => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await createItem({ title: newTitle.trim() });
      // If not planned, move it to the right column
      if (status !== 'planned') {
        const created = items[0]; // just created, at top
        if (created) await updateItem(created.id, { status });
      }
      setNewTitle('');
      setAddingInColumn(null);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDragStart = useCallback((itemId: string) => {
    setDragItemId(itemId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDropTarget(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (status: string) => {
      if (!dragItemId) return;
      setDropTarget(null);
      setDragItemId(null);
      const item = items.find((i) => i.id === dragItemId);
      if (!item || item.status === status) return;
      await updateItem(dragItemId, { status });
    },
    [dragItemId, items, updateItem],
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b border-border-subtle">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Backlog</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Vote on features you want to see built
          </p>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-accent animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 min-w-[720px] h-full">
            {COLUMNS.map((col) => {
              const Icon = col.icon;
              const colItems = grouped[col.status] || [];
              const isDropping = dropTarget === col.status;

              return (
                <div
                  key={col.status}
                  className={`flex flex-col w-1/3 min-w-[250px] rounded-xl transition-all duration-200 ${col.bgColor} ${
                    isDropping ? 'ring-2 ring-accent/50 scale-[1.01]' : ''
                  }`}
                  onDragOver={(e) => isAdmin && handleDragOver(e, col.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => isAdmin && handleDrop(col.status)}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${col.color}`} />
                      <h3 className="text-sm font-bold text-text-primary">{col.label}</h3>
                      <span className="rounded-full bg-surface-3/80 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary min-w-[20px] text-center">
                        {colItems.length}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingInColumn(addingInColumn === col.status ? null : col.status);
                          setNewTitle('');
                        }}
                        className="rounded p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
                        title="Add card"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                    {/* Inline add at top of column */}
                    {addingInColumn === col.status && (
                      <div className="rounded-lg bg-surface-2 border border-border-subtle p-2 space-y-2">
                        <textarea
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="Enter a title..."
                          rows={2}
                          autoFocus
                          className="w-full rounded border-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleQuickAdd(col.status);
                            }
                            if (e.key === 'Escape') setAddingInColumn(null);
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickAdd(col.status)}
                            disabled={!newTitle.trim() || isCreating}
                            className="rounded bg-accent px-3 py-1 text-xs font-medium text-surface-0 disabled:opacity-50 hover:bg-accent-hover transition-colors"
                          >
                            {isCreating ? 'Adding...' : 'Add card'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingInColumn(null)}
                            className="rounded p-1 text-text-tertiary hover:text-text-secondary"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {colItems.length === 0 && addingInColumn !== col.status && (
                      <div className="flex flex-col items-center justify-center py-8 opacity-40">
                        <Icon className={`h-5 w-5 ${col.color} mb-1`} />
                        <p className="text-[10px] text-text-tertiary">No items</p>
                      </div>
                    )}

                    {colItems.map((item) => (
                      <div
                        key={item.id}
                        draggable={isAdmin}
                        onDragStart={() => isAdmin && handleDragStart(item.id)}
                        onDragEnd={() => {
                          setDragItemId(null);
                          setDropTarget(null);
                        }}
                      >
                        <BacklogItemCard
                          item={item}
                          onVote={vote}
                          onRemoveVote={removeVote}
                          isDragging={dragItemId === item.id}
                          isAdmin={isAdmin}
                          onUpdate={updateItem}
                          onDelete={deleteItem}
                          onClick={() => setSelectedItem(item)}
                        />
                      </div>
                    ))}

                    {/* Add card button at bottom */}
                    {isAdmin && addingInColumn !== col.status && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingInColumn(col.status);
                          setNewTitle('');
                        }}
                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-2/50 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add a card
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card detail modal */}
      {selectedItem && (
        <CardDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onVote={vote}
          onRemoveVote={removeVote}
          isAdmin={isAdmin}
          onUpdate={updateItem}
          onDelete={async (id) => {
            await deleteItem(id);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}

// --- Card Detail Modal ---

function CardDetailModal({
  item,
  onClose,
  onVote,
  onRemoveVote,
  isAdmin,
  onUpdate,
  onDelete,
}: {
  item: BacklogItem;
  onClose: () => void;
  onVote: (id: string, type: 'up' | 'down') => void;
  onRemoveVote: (id: string) => void;
  isAdmin: boolean;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(item.description ?? '');

  const STATUS_OPTIONS = [
    { value: 'planned', label: 'Planned', color: 'text-blue-400' },
    { value: 'in_progress', label: 'In Progress', color: 'text-amber-400' },
    { value: 'shipped', label: 'Shipped', color: 'text-emerald-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl rounded-xl bg-surface-1 border border-border-subtle shadow-dark-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex-1 min-w-0">
            {item.category && (
              <span className="inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold text-white bg-blue-500 mb-2">
                {item.category}
              </span>
            )}
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={async () => {
                  if (editTitle.trim() && editTitle !== item.title) {
                    await onUpdate(item.id, { title: editTitle.trim() });
                  }
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full rounded border border-border-default bg-surface-3 px-2 py-1 text-lg font-bold text-text-primary focus:border-accent focus:outline-none"
                autoFocus
              />
            ) : (
              <h2
                className={`text-lg font-bold text-text-primary ${isAdmin ? 'cursor-pointer hover:text-accent' : ''}`}
                onClick={() => isAdmin && setIsEditingTitle(true)}
              >
                {item.title}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors ml-3"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">
          {/* Status selector (admin) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">Status:</span>
              <div className="flex gap-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdate(item.id, { status: opt.value })}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      item.status === opt.value
                        ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                        : 'bg-surface-3 text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary mb-1">Description</h4>
            {isEditingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none resize-none"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await onUpdate(item.id, { description: editDesc.trim() });
                      setIsEditingDesc(false);
                    }}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-surface-0"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDesc(item.description ?? '');
                      setIsEditingDesc(false);
                    }}
                    className="rounded px-3 py-1 text-xs text-text-tertiary hover:bg-surface-3"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-secondary min-h-[60px] ${isAdmin ? 'cursor-pointer hover:bg-surface-3' : ''}`}
                onClick={() => isAdmin && setIsEditingDesc(true)}
              >
                {item.description || (
                  <span className="text-text-tertiary italic">
                    {isAdmin ? 'Click to add a description...' : 'No description'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Votes */}
          <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => {
                if (item.userVote === 'up') onRemoveVote(item.id);
                else onVote(item.id, 'up');
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                item.userVote === 'up'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
              }`}
            >
              <ChevronUp className="h-4 w-4" />
              Upvote ({item.score})
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={async () => {
                  await onDelete(item.id);
                }}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
