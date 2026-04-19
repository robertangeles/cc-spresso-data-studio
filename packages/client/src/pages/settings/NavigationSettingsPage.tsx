import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, GripVertical, Plus, Save, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useSidebarConfig } from '../../hooks/useSidebarConfig';
import { NAV_MANIFEST, type SavedNavItem } from '../../config/navManifest';

/**
 * Admin-only page for reordering the left sidebar nav, toggling visibility,
 * and enabling newly-shipped items.
 *
 * Drag-drop uses native HTML5 — the list is small (< 20 items) so no library.
 * Changes are staged in local state and committed on Save.
 */
export function NavigationSettingsPage() {
  const { resolved, unmanaged, saved, isLoading, refresh, save } = useSidebarConfig();

  // Local editable state — merged from resolved (managed) + optional unmanaged adds
  const [items, setItems] = useState<
    Array<{ key: string; label: string; visible: boolean; isNew: boolean }>
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Sync local state from hook when it loads
  useEffect(() => {
    if (isLoading) return;
    setItems(
      resolved.map((r) => ({
        key: r.key,
        label: r.label,
        visible: r.visible,
        isNew: false,
      })),
    );
  }, [isLoading, resolved.map((r) => `${r.key}:${r.visible}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelByKey = useMemo(() => new Map(NAV_MANIFEST.map((m) => [m.key, m.label])), []);

  // Items in the manifest not yet in the user's managed list
  const availableToAdd = useMemo(
    () => unmanaged.filter((u) => !items.some((i) => i.key === u.key)),
    [unmanaged, items],
  );

  const toggleVisible = (key: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, visible: !i.visible } : i)));
  };

  const addUnmanaged = (key: string) => {
    const label = labelByKey.get(key);
    if (!label) return;
    setItems((prev) => [...prev, { key, label, visible: true, isNew: true }]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const onDragStart = (key: string) => setDraggedKey(key);
  const onDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (key !== dragOverKey) setDragOverKey(key);
  };
  const onDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };
  const onDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedKey || draggedKey === targetKey) {
      onDragEnd();
      return;
    }
    setItems((prev) => {
      const from = prev.findIndex((i) => i.key === draggedKey);
      const to = prev.findIndex((i) => i.key === targetKey);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    onDragEnd();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload: SavedNavItem[] = items.map((i) => ({ key: i.key, visible: i.visible }));
      await save(payload);
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = async () => {
    await refresh();
  };

  // Has the admin made any local edits?
  const dirty = useMemo(() => {
    const current: SavedNavItem[] = items.map((i) => ({ key: i.key, visible: i.visible }));
    const original: SavedNavItem[] = saved ?? [];
    if (current.length !== original.length) return true;
    return current.some(
      (c, idx) => c.key !== original[idx].key || c.visible !== original[idx].visible,
    );
  }, [items, saved]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Navigation</h3>
        <p className="text-sm text-text-secondary">
          Reorder the left sidebar by dragging items, toggle visibility, or remove items to hide
          them from everyone. Changes are saved globally and take effect on next page load for all
          users.
        </p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/80 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Managed items
            </p>
            <span className="text-[10px] text-text-tertiary">({items.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={handleRevert} disabled={isSaving}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="ml-1">Revert</span>
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={isSaving || !dirty}>
              <Save className="h-3.5 w-3.5" />
              <span className="ml-1">{isSaving ? 'Saving…' : 'Save'}</span>
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-text-tertiary italic px-3 py-8 text-center">
            No items. Add from the list below.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.key}
                draggable
                onDragStart={() => onDragStart(item.key)}
                onDragOver={(e) => onDragOver(e, item.key)}
                onDrop={(e) => onDrop(e, item.key)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2 transition-all ${
                  draggedKey === item.key ? 'opacity-40' : ''
                } ${
                  dragOverKey === item.key && draggedKey !== item.key
                    ? 'border-accent/60 bg-accent/5'
                    : ''
                } ${!item.visible ? 'opacity-60' : ''}`}
              >
                <GripVertical className="h-4 w-4 text-text-tertiary cursor-grab active:cursor-grabbing" />
                <span className="flex-1 text-sm font-medium text-text-primary">{item.label}</span>
                {item.isNew && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                    new
                  </span>
                )}
                <span className="font-mono text-[10px] text-text-tertiary/60">{item.key}</span>
                <button
                  type="button"
                  onClick={() => toggleVisible(item.key)}
                  className={`p-1.5 rounded-md transition-colors ${
                    item.visible
                      ? 'text-accent hover:bg-accent/10'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
                  }`}
                  title={item.visible ? 'Hide from sidebar' : 'Show in sidebar'}
                >
                  {item.visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="p-1.5 rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors text-[10px] font-semibold uppercase tracking-wider"
                  title="Remove from managed list (moves back to available)"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {saveError && <p className="mt-3 text-xs text-red-400">{saveError}</p>}
      </div>

      {/* Unmanaged / available items */}
      <div className="rounded-xl border border-border-subtle bg-surface-1/80 backdrop-blur-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Available to add
          </p>
          <span className="text-[10px] text-text-tertiary">({availableToAdd.length})</span>
        </div>
        {availableToAdd.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">
            All manifest items are already managed. When new items ship, they appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {availableToAdd.map((u) => (
              <li
                key={u.key}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-2/20 px-3 py-2"
              >
                <span className="flex-1 text-sm text-text-secondary">{u.label}</span>
                <span className="font-mono text-[10px] text-text-tertiary/60">{u.key}</span>
                <Button variant="secondary" size="sm" onClick={() => addUnmanaged(u.key)}>
                  <Plus className="h-3 w-3" />
                  <span className="ml-1">Add</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] text-text-tertiary">
          Newly-shipped nav items stay hidden until an admin adds them here. This prevents surprise
          UI changes for users.
        </p>
      </div>
    </div>
  );
}
