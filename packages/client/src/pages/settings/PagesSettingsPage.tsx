import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Save, Eye, Pencil } from 'lucide-react';
import Markdown from 'react-markdown';
import { api } from '../../lib/api';

interface Page {
  id: string;
  slug: string;
  title: string;
  body: string;
  isPublished: boolean;
  updatedAt: string;
}

export function PagesSettingsPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [saveMessage, setSaveMessage] = useState('');

  const initializedRef = useRef(false);

  const fetchPages = useCallback(async () => {
    try {
      const { data } = await api.get('/pages');
      const fetched = (data.data ?? []) as Page[];
      setPages(fetched);
      // Auto-select first page on initial load only
      if (!initializedRef.current && fetched.length > 0) {
        initializedRef.current = true;
        selectPage(fetched[0]);
      }
    } catch {
      /* non-blocking */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const selectPage = (page: Page) => {
    setActivePage(page);
    setEditBody(page.body);
    setEditTitle(page.title);
    setSaveMessage('');
  };

  const handleSave = async () => {
    if (!activePage) return;
    setIsSaving(true);
    try {
      const { data } = await api.put(`/pages/${activePage.slug}`, {
        title: editTitle,
        body: editBody,
      });
      const updated = data.data as Page;
      setPages((prev) => prev.map((p) => (p.slug === updated.slug ? updated : p)));
      setActivePage(updated);
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = activePage && (editBody !== activePage.body || editTitle !== activePage.title);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Pages</h3>
        <p className="text-sm text-text-secondary mt-1">
          Edit legal and static pages. Content uses Markdown formatting.
        </p>
      </div>

      {/* Page selector */}
      <div className="flex gap-2">
        {pages.map((page) => (
          <button
            key={page.slug}
            onClick={() => selectPage(page)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePage?.slug === page.slug
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-surface-2 text-text-secondary hover:bg-surface-3 border border-border-subtle'
            }`}
          >
            <FileText className="h-4 w-4" />
            {page.title}
          </button>
        ))}
      </div>

      {activePage && (
        <div className="space-y-3">
          {/* Title + toolbar */}
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="rounded-lg border border-border-default bg-surface-2 px-3 py-1.5 text-sm font-medium text-text-primary focus:border-accent focus:outline-none w-64"
            />
            <div className="flex items-center gap-2">
              {/* View mode toggles */}
              <div className="flex rounded-lg border border-border-subtle overflow-hidden">
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-2.5 py-1 text-xs ${viewMode === 'edit' ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`px-2.5 py-1 text-xs border-x border-border-subtle ${viewMode === 'split' ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  Split
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`px-2.5 py-1 text-xs ${viewMode === 'preview' ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>

              {saveMessage && (
                <span
                  className={`text-xs ${saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {saveMessage}
                </span>
              )}

              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-40 hover:bg-accent-hover transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Editor + Preview */}
          <div
            className={`flex gap-4 ${viewMode === 'split' ? '' : ''}`}
            style={{ minHeight: '500px' }}
          >
            {/* Markdown editor */}
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div className={viewMode === 'split' ? 'w-1/2' : 'w-full'}>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full h-full min-h-[500px] rounded-lg border border-border-default bg-surface-2 p-4 text-sm text-text-primary font-mono
                             placeholder:text-text-tertiary focus:border-accent focus:outline-none resize-none"
                  placeholder="Write markdown content..."
                />
              </div>
            )}

            {/* Live preview */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} rounded-lg border border-border-default bg-surface-1 p-4 overflow-y-auto`}
                style={{ minHeight: '500px' }}
              >
                <div className="prose prose-invert prose-sm max-w-none text-text-secondary prose-headings:text-text-primary prose-a:text-accent prose-strong:text-text-primary prose-li:text-text-secondary">
                  <Markdown>{editBody}</Markdown>
                </div>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 text-[10px] text-text-tertiary">
            <span>Slug: /{activePage.slug}</span>
            <span>URL: spresso.xyz/{activePage.slug}</span>
            <span>Last updated: {new Date(activePage.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
