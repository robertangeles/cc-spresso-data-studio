import { useState, useEffect, useCallback } from 'react';
import { Wand2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';

interface SystemPrompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromptFormData {
  slug: string;
  name: string;
  description: string;
  category: string;
  body: string;
  isActive: boolean;
}

const CATEGORIES = [
  'system',
  'content',
  'chat',
  'repurpose',
  'analysis',
  'other',
];

const CATEGORY_COLORS: Record<string, string> = {
  system: 'bg-blue-500/20 text-blue-400',
  content: 'bg-purple-500/20 text-purple-400',
  chat: 'bg-green-500/20 text-green-400',
  repurpose: 'bg-amber-500/20 text-amber-400',
  analysis: 'bg-cyan-500/20 text-cyan-400',
  other: 'bg-surface-3 text-text-tertiary',
};

const emptyForm: PromptFormData = {
  slug: '',
  name: '',
  description: '',
  category: 'system',
  body: '',
  isActive: true,
};

export function SystemPromptsPage() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<PromptFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/system-prompts');
      setPrompts(data.data ?? data);
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const openCreate = () => {
    setEditingPrompt(null);
    setForm(emptyForm);
    setShowEditor(true);
  };

  const openEdit = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt);
    setForm({
      slug: prompt.slug,
      name: prompt.name,
      description: prompt.description ?? '',
      category: prompt.category,
      body: prompt.body,
      isActive: prompt.isActive,
    });
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingPrompt(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingPrompt) {
        await api.put(`/system-prompts/${editingPrompt.id}`, form);
      } else {
        await api.post('/system-prompts', form);
      }
      closeEditor();
      await fetchPrompts();
    } catch {
      // keep editor open on error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this system prompt? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/system-prompts/${id}`);
      await fetchPrompts();
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold text-text-primary">System Prompts</h3>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Manage platform-level AI prompts used by Spresso features.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          Add Prompt
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : prompts.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-12 text-center">
          <Wand2 className="mx-auto h-10 w-10 text-text-tertiary mb-3" />
          <p className="text-text-secondary text-sm">
            No system prompts yet. Add your first one to power AI features.
          </p>
        </div>
      ) : (
        /* Prompt grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="bg-surface-2 rounded-xl border border-border-subtle p-5 hover:-translate-y-0.5 hover:shadow-dark-lg transition-all duration-200"
            >
              {/* Top row: name + active badge */}
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-semibold text-text-primary truncate">
                  {prompt.name}
                </h4>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    prompt.isActive
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-surface-3 text-text-tertiary'
                  }`}
                >
                  {prompt.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Slug */}
              <span className="inline-block bg-surface-3 text-text-tertiary text-xs font-mono px-2 py-0.5 rounded mb-2">
                {prompt.slug}
              </span>

              {/* Description */}
              {prompt.description && (
                <p className="text-sm text-text-secondary line-clamp-2 mb-2">
                  {prompt.description}
                </p>
              )}

              {/* Category badge */}
              <div className="mb-3">
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                    CATEGORY_COLORS[prompt.category] ?? CATEGORY_COLORS.other
                  }`}
                >
                  {prompt.category}
                </span>
              </div>

              {/* Body preview */}
              <div className="bg-surface-3 rounded-lg p-3 text-xs font-mono text-text-tertiary mb-4 line-clamp-3">
                {prompt.body.length > 100 ? prompt.body.slice(0, 100) + '...' : prompt.body}
              </div>

              {/* Footer actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(prompt)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(prompt.id)}
                  disabled={deleting === prompt.id}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border-subtle bg-surface-1 shadow-dark-lg mx-4 max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <h3 className="text-lg font-semibold text-text-primary">
                {editingPrompt ? 'Edit System Prompt' : 'Create System Prompt'}
              </h3>
              <button
                onClick={closeEditor}
                className="rounded-lg p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  readOnly={!!editingPrompt}
                  placeholder="e.g. apex-system"
                  className={`w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none ${
                    editingPrompt ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. APEX System Prompt"
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this prompt's purpose"
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Prompt Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Enter the system prompt content..."
                  rows={12}
                  className="w-full min-h-[300px] rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none resize-y"
                />
              </div>

              {/* isActive toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    form.isActive ? 'bg-accent' : 'bg-surface-4'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      form.isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-text-secondary">
                  {form.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">
              <button
                onClick={closeEditor}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.slug || !form.name || !form.body}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingPrompt ? 'Update Prompt' : 'Create Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
