import { useState, useEffect, useRef } from 'react';
import { Plus, Check, Pencil, Trash2, X } from 'lucide-react';
import type { CardLabel } from '@cc/shared';
import { api } from '../../lib/api';

interface CardLabelPickerProps {
  projectId: string;
  cardId: string;
  cardLabels: CardLabel[];
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
];

export function CardLabelPicker({ projectId, cardId, cardLabels }: CardLabelPickerProps) {
  const [projectLabels, setProjectLabels] = useState<CardLabel[]>([]);
  const [activeLabels, setActiveLabels] = useState<Set<string>>(
    new Set(cardLabels.map((l) => l.id)),
  );
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch project labels
  useEffect(() => {
    api
      .get(`/projects/${projectId}/labels`)
      .then(({ data }) => setProjectLabels(data.data ?? []))
      .catch(() => {});
  }, [projectId]);

  // Sync activeLabels when cardLabels prop changes
  useEffect(() => {
    setActiveLabels(new Set(cardLabels.map((l) => l.id)));
  }, [cardLabels]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleLabel = async (label: CardLabel) => {
    const isActive = activeLabels.has(label.id);
    // Optimistic update
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (isActive) next.delete(label.id);
      else next.add(label.id);
      return next;
    });
    try {
      if (isActive) {
        await api.delete(`/projects/${projectId}/cards/${cardId}/labels/${label.id}`);
      } else {
        await api.post(`/projects/${projectId}/cards/${cardId}/labels`, { labelId: label.id });
      }
    } catch {
      // Revert on failure
      setActiveLabels((prev) => {
        const next = new Set(prev);
        if (isActive) next.add(label.id);
        else next.delete(label.id);
        return next;
      });
    }
  };

  const handleCreateLabel = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/labels`, {
        name: newName.trim(),
        color: newColor,
      });
      const created: CardLabel = data.data;
      setProjectLabels((prev) => [...prev, created]);
      // Auto-apply new label to card
      await api.post(`/projects/${projectId}/cards/${cardId}/labels`, { labelId: created.id });
      setActiveLabels((prev) => new Set([...prev, created.id]));
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setShowCreate(false);
    } catch {
      // ignore
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteLabel = async (e: React.MouseEvent, labelId: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/projects/${projectId}/labels/${labelId}`);
      setProjectLabels((prev) => prev.filter((l) => l.id !== labelId));
      setActiveLabels((prev) => {
        const next = new Set(prev);
        next.delete(labelId);
        return next;
      });
    } catch {
      // ignore
    }
  };

  // Currently active label objects for display
  const activeLabelObjects = projectLabels.filter((l) => activeLabels.has(l.id));

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Chips display + add button */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {activeLabelObjects.map((label) => (
          <span
            key={label.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white/90"
            style={{ backgroundColor: label.color + '33', border: `1px solid ${label.color}55` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-3/50 px-2 py-0.5 text-[11px] text-text-tertiary hover:text-text-secondary hover:border-accent/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {activeLabelObjects.length === 0 ? 'Add label' : 'Edit'}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-64 rounded-xl border border-white/10 bg-surface-1/95 backdrop-blur-md shadow-dark-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-border-subtle">
            <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
              Labels
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {projectLabels.length === 0 && !showCreate && (
              <p className="px-3 py-3 text-xs text-text-tertiary">
                No labels yet. Create one below.
              </p>
            )}
            {projectLabels.map((label) => {
              const isActive = activeLabels.has(label.id);
              return (
                <div
                  key={label.id}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-surface-3/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => void toggleLabel(label)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <div
                      className="h-4 w-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        backgroundColor: isActive ? label.color : 'transparent',
                        border: `2px solid ${label.color}`,
                      }}
                    >
                      {isActive && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-xs text-text-primary truncate">{label.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteLabel(e, label.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Create new label */}
          <div className="border-t border-border-subtle p-3">
            {showCreate ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Label name..."
                  autoFocus
                  className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none transition-all"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        outline: newColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setNewName('');
                    }}
                    className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateLabel()}
                    disabled={!newName.trim() || isCreating}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1 text-[11px] font-medium text-surface-0 disabled:opacity-50 transition-all"
                  >
                    <Pencil className="h-3 w-3" />
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create new label
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
