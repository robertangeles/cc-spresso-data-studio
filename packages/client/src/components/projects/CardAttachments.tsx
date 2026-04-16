import { useState, useEffect } from 'react';
import { Paperclip, Image, FileText, Link2, ExternalLink, Trash2, Plus } from 'lucide-react';
import type { CardAttachment, CreateAttachmentDTO } from '@cc/shared';
import { api } from '../../lib/api';

interface CardAttachmentsProps {
  cardId: string;
  projectId: string;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  switch (type) {
    case 'image':
      return Image;
    case 'file':
      return FileText;
    case 'link':
    default:
      return Link2;
  }
}

export function CardAttachments({ cardId, projectId }: CardAttachmentsProps) {
  const base = `/projects/${projectId}/cards/${cardId}/attachments`;

  const [attachments, setAttachments] = useState<CardAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add link form state
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'link' | 'image' | 'file'>('link');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api
      .get(base)
      .then(({ data }) => {
        if (!cancelled) setAttachments(data.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const handleAdd = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setIsAdding(true);
    try {
      const dto: CreateAttachmentDTO = {
        url: trimmedUrl,
        fileName: name.trim() || undefined,
        type,
      };
      const { data } = await api.post(base, dto);
      setAttachments((prev) => [...prev, data.data]);
      setUrl('');
      setName('');
      setType('link');
      setShowForm(false);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    await api.delete(`${base}/${attachmentId}`);
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
        <div className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
        Loading attachments...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Attachment list */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
        {attachments.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-surface-3/50 p-3 mb-3">
              <Paperclip className="h-6 w-6 text-text-tertiary" />
            </div>
            <p className="text-sm text-text-tertiary">No attachments yet.</p>
          </div>
        ) : (
          attachments.map((attachment) => {
            const Icon = getFileIcon(attachment.type);
            return (
              <div
                key={attachment.id}
                className="group flex items-center gap-3 rounded-lg bg-surface-2/50 backdrop-blur-sm border border-white/5 p-3 transition-all hover:border-white/10"
              >
                <div className="flex-shrink-0 rounded-lg bg-surface-3/50 p-2">
                  <Icon className="h-4 w-4 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent transition-colors truncate max-w-full"
                    title={attachment.url}
                  >
                    <span className="truncate">{attachment.fileName || attachment.url}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  {attachment.fileSize ? (
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(attachment.id)}
                  className="rounded p-1 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add link form */}
      {showForm ? (
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
          />
          <div className="flex items-center gap-1.5">
            {(['link', 'image', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 capitalize ${
                  type === t
                    ? 'bg-accent/15 text-accent ring-1 ring-accent/30 shadow-[0_0_8px_rgba(255,214,10,0.1)]'
                    : 'bg-surface-3/50 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setUrl('');
                setName('');
                setType('link');
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!url.trim() || isAdding}
              className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all duration-200"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-3/30 transition-colors w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            Add link attachment
          </button>
        </div>
      )}
    </div>
  );
}
