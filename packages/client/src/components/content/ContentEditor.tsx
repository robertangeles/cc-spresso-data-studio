import { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ContentEditorProps {
  item: {
    id: string;
    title: string;
    body: string;
    status: string;
    tags: string[];
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  onSave: (updates: { title?: string; body?: string; status?: string }) => Promise<void>;
  onClose: () => void;
}

export function ContentEditor({ item, onSave, onClose }: ContentEditorProps) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [status, setStatus] = useState(item.status);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ title, body, status });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Edit Content</h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCopy}>
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>

      <Card padding="lg">
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Content</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <h4 className="mb-2 text-sm font-medium text-gray-500">Metadata</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
          {item.metadata?.model ? <div>Model: {String(item.metadata.model)}</div> : null}
          {item.metadata?.durationMs ? <div>Duration: {String(item.metadata.durationMs)}ms</div> : null}
          {item.tags.length > 0 && <div>Tags: {item.tags.join(', ')}</div>}
        </div>
      </Card>
    </div>
  );
}
