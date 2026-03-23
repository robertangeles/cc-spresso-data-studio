import { useState } from 'react';
import { useContent, useChannels } from '../hooks/useContent';
import { ContentCard } from '../components/content/ContentCard';
import { ContentEditor } from '../components/content/ContentEditor';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { FileText } from 'lucide-react';

interface ContentItem {
  id: string;
  title: string;
  body: string;
  status: string;
  channelId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function ContentLibraryPage() {
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { items, isLoading, refresh, updateItem, deleteItem } = useContent({
    channelId: channelFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const channels = useChannels();

  if (selectedItem) {
    return (
      <ContentEditor
        item={selectedItem}
        onSave={async (updates) => {
          const updated = await updateItem(selectedItem.id, updates);
          setSelectedItem(updated);
        }}
        onClose={() => { setSelectedItem(null); refresh(); }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Content Library</h2>
        <p className="mt-1 text-sm text-gray-500">
          All your AI-generated content in one place. Edit, refine, and distribute.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search content..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        />
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Channels</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>{ch.icon} {ch.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onSelect={() => setSelectedItem(item as ContentItem)}
              onCopy={() => navigator.clipboard.writeText(item.body)}
              onDelete={() => setDeleteId(item.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="Content will appear here"
          description="Run an orchestration to generate content, or create content manually."
        />
      )}

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Content"
        confirmLabel="Delete"
        onConfirm={async () => { if (deleteId) { await deleteItem(deleteId); setDeleteId(null); } }}
        variant="danger"
      >
        <p>Delete this content permanently? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
