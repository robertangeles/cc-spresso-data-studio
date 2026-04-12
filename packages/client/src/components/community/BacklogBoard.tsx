import { useState, useMemo, useCallback } from 'react';
import { Filter, Plus, Loader2, Rocket, Hammer, CheckCircle2, X } from 'lucide-react';
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
  accentClass: string;
  headerGradient: string;
}> = [
  {
    status: 'planned',
    label: 'Planned',
    icon: Rocket,
    accentClass: 'text-blue-400 border-blue-500/30',
    headerGradient: 'from-blue-500/20 to-blue-600/20',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    icon: Hammer,
    accentClass: 'text-amber-400 border-amber-500/30',
    headerGradient: 'from-accent/20 to-amber-600/20',
  },
  {
    status: 'shipped',
    label: 'Shipped',
    icon: CheckCircle2,
    accentClass: 'text-emerald-400 border-emerald-500/30',
    headerGradient: 'from-emerald-500/20 to-emerald-600/20',
  },
];

export function BacklogBoard({ isAdmin = false }: BacklogBoardProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const { items, loading, vote, removeVote, createItem, updateItem, deleteItem } = useBacklogItems({
    category: categoryFilter || undefined,
  });

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Drag-and-drop state
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [items]);

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

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await createItem({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        category: newCategory.trim() || undefined,
      });
      setNewTitle('');
      setNewDescription('');
      setNewCategory('');
      setShowCreate(false);
    } finally {
      setIsCreating(false);
    }
  };

  // Drag handlers (admin only)
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

      // Find the item and check if status actually changed
      const item = items.find((i) => i.id === dragItemId);
      if (!item || item.status === status) return;

      await updateItem(dragItemId, { status });
    },
    [dragItemId, items, updateItem],
  );

  return (
    <div
      className="flex-1 flex flex-col min-w-0"
      style={{
        background:
          'radial-gradient(ellipse at center 0%, rgba(255,255,255,0.015) 0%, transparent 60%), #0a0a0b',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0 shadow-dark-sm"
        style={{
          background:
            'linear-gradient(90deg, rgba(17,17,19,0.9) 0%, rgba(17,17,19,0.7) 50%, rgba(17,17,19,0.9) 100%)',
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-text-primary">Backlog</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Vote on features you want to see built
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none rounded-lg bg-surface-2/50 backdrop-blur-sm pl-8 pr-6 py-1.5 text-xs text-text-secondary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.08)] transition-all duration-200"
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-xs font-semibold text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.15)] transition-all duration-200 ease-spring hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </button>
          )}
        </div>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="px-6 py-3 border-b border-border-subtle bg-surface-2/30">
          <div className="max-w-lg space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Feature title..."
              autoFocus
              className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category (optional)"
                className="flex-1 rounded-lg border border-border-default bg-surface-3 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim() || isCreating}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50 hover:bg-accent-hover transition-colors"
              >
                {isCreating ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-accent animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="grid grid-cols-3 gap-6 min-w-[720px]">
            {COLUMNS.map((col) => {
              const Icon = col.icon;
              const colItems = grouped[col.status] || [];
              const isDropping = dropTarget === col.status;

              return (
                <div
                  key={col.status}
                  className={`flex flex-col rounded-xl transition-all duration-200 ${
                    isDropping ? 'ring-2 ring-accent/40 bg-accent/5' : ''
                  }`}
                  onDragOver={(e) => isAdmin && handleDragOver(e, col.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => isAdmin && handleDrop(col.status)}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 pb-3 mb-3">
                    <div
                      className={`flex items-center gap-2 bg-gradient-to-r ${col.headerGradient} backdrop-blur-sm rounded-full px-3 py-1 ${col.accentClass}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <h3 className="text-xs font-semibold text-text-primary">{col.label}</h3>
                    </div>
                    <span className="ml-auto text-xs text-text-tertiary bg-surface-3/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                      {colItems.length}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-2 flex-1 min-h-[100px]">
                    {colItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 rounded-xl bg-surface-2/10 backdrop-blur-sm">
                        <Icon className={`h-6 w-6 ${col.accentClass} opacity-30 mb-2`} />
                        <p className="text-xs text-text-tertiary/60">Nothing here yet</p>
                      </div>
                    ) : (
                      colItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="animate-slide-up"
                          style={{ animationDelay: `${index * 50}ms` }}
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
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
