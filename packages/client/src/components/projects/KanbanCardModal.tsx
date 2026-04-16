import { useState, useEffect } from 'react';
import { X, Trash2, Calendar, Tag, MessageSquare, Paperclip } from 'lucide-react';
import type { KanbanCard, UpdateCardDTO } from '@cc/shared';
import { CardComments } from './CardComments';
import { CardAttachments } from './CardAttachments';

interface KanbanCardModalProps {
  card: KanbanCard | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (data: UpdateCardDTO) => Promise<void>;
  onDelete: () => Promise<void>;
}

const PRIORITY_OPTIONS: Array<{ value: string; label: string; style: string }> = [
  { value: 'urgent', label: 'Urgent', style: 'bg-red-500/15 text-red-400' },
  { value: 'high', label: 'High', style: 'bg-amber-500/15 text-amber-400' },
  { value: 'medium', label: 'Medium', style: 'bg-blue-500/15 text-blue-400' },
  { value: 'low', label: 'Low', style: 'bg-slate-500/15 text-slate-400' },
];

type TabKey = 'details' | 'comments' | 'attachments';

const TABS: Array<{ key: TabKey; label: string; icon: typeof MessageSquare }> = [
  { key: 'details', label: 'Details', icon: Tag },
  { key: 'comments', label: 'Comments', icon: MessageSquare },
  { key: 'attachments', label: 'Attachments', icon: Paperclip },
];

export function KanbanCardModal({
  card,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
}: KanbanCardModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('details');

  // Sync form state when card changes
  useEffect(() => {
    if (card) {
      setTitle(card.title || '');
      setDescription(card.description || '');
      setPriority(card.priority || 'medium');
      setDueDate(card.dueDate ? card.dueDate.split('T')[0] : '');
      setTagsInput((card.tags || []).join(', '));
      setConfirmDelete(false);
      setActiveTab('details');
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onUpdate({
        title: title.trim(),
        description: description.trim(),
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
        dueDate: dueDate || null,
        tags,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-xl bg-surface-1/95 backdrop-blur-md border border-white/10 shadow-dark-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[80vh]">
        {/* Header — title always editable */}
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-lg font-bold text-text-primary placeholder:text-text-tertiary focus:outline-none border-b border-transparent focus:border-accent/30 pb-1 transition-colors"
              placeholder="Card title..."
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors ml-3 flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-5 border-b border-border-subtle flex-shrink-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-accent to-amber-600 shadow-[0_0_8px_rgba(255,214,10,0.3)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === 'details' && (
            <div className="px-5 py-4 space-y-4">
              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Add a description..."
                  className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] resize-none transition-all"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
                  Priority
                </label>
                <div className="flex gap-1.5">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                        priority === opt.value
                          ? `${opt.style} ring-1 ring-current/30 shadow-[0_0_8px_rgba(255,214,10,0.1)]`
                          : 'bg-surface-3/50 text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-1.5 text-sm text-text-primary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] [color-scheme:dark] transition-all"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="design, frontend, bug (comma separated)"
                  className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
                />
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="px-5 py-4 h-[400px]">
              <CardComments cardId={card.id} projectId={card.projectId} />
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="px-5 py-4 h-[400px]">
              <CardAttachments cardId={card.id} projectId={card.projectId} />
            </div>
          )}
        </div>

        {/* Actions — always visible */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle flex-shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              confirmDelete
                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                : 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? 'Click again to confirm' : 'Delete'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim() || isSaving}
              className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all duration-200"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
