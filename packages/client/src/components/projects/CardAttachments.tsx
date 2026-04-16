import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Paperclip,
  Image,
  FileText,
  Link2,
  ExternalLink,
  Trash2,
  Plus,
  Upload,
  X,
  AlertCircle,
} from 'lucide-react';
import type { CardAttachment, CreateAttachmentDTO } from '@cc/shared';
import { api } from '../../lib/api';

interface CardAttachmentsProps {
  cardId: string;
  projectId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeIcon(mimeType: string | null, type: string): React.ElementType {
  if (type === 'image') return Image;
  if (type === 'link') return Link2;
  if (!mimeType) return FileText;
  if (mimeType.startsWith('image/')) return Image;
  return FileText;
}

export function CardAttachments({ cardId, projectId }: CardAttachmentsProps) {
  const base = `/projects/${projectId}/cards/${cardId}/attachments`;
  const uploadUrl = `/projects/${projectId}/cards/${cardId}/attachments/upload`;

  const [attachments, setAttachments] = useState<CardAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add link form state
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'link' | 'image' | 'file'>('link');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .get(base)
      .then(({ data }) => {
        if (!cancelled) setAttachments(data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load attachments');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds the 10 MB limit.`);
        return;
      }
      setError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const { data } = await api.post(uploadUrl, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        setAttachments((prev) => [...prev, data.data]);
      } catch {
        setError(`Failed to upload "${file.name}"`);
      } finally {
        setUploadProgress(null);
      }
    },
    [uploadUrl],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      files.forEach((f) => void uploadFile(f));
    },
    [uploadFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => void uploadFile(f));
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleAdd = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setIsAdding(true);
    setError(null);
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
    } catch {
      setError('Failed to add attachment');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    setError(null);
    try {
      await api.delete(`${base}/${attachmentId}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      setError('Failed to delete attachment');
    }
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
    <div className="flex flex-col h-full gap-3">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400/70 hover:text-red-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Drag-and-drop upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-accent/60 bg-accent/5 shadow-[0_0_16px_rgba(255,214,10,0.1)]'
            : 'border-border-subtle bg-surface-2/30 hover:border-accent/30 hover:bg-accent/5'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <div
          className={`rounded-full p-2.5 transition-colors ${isDragOver ? 'bg-accent/15' : 'bg-surface-3/50'}`}
        >
          <Upload
            className={`h-5 w-5 transition-colors ${isDragOver ? 'text-accent' : 'text-text-tertiary'}`}
          />
        </div>
        {uploadProgress !== null ? (
          <div className="w-full max-w-[160px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-text-secondary">Uploading...</span>
              <span className="text-[11px] font-semibold text-accent">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-amber-600 transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-text-secondary">
              Drop files here or{' '}
              <span className="text-accent underline underline-offset-2">browse</span>
            </p>
            <p className="text-[10px] text-text-tertiary">Max 10 MB per file</p>
          </>
        )}
      </div>

      {/* Attachment list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Paperclip className="h-5 w-5 text-text-tertiary mb-2" />
            <p className="text-xs text-text-tertiary">No attachments yet.</p>
          </div>
        ) : (
          attachments.map((attachment) => {
            const Icon = getMimeIcon(attachment.mimeType, attachment.type);
            const isImage =
              attachment.type === 'image' || attachment.mimeType?.startsWith('image/');
            return (
              <div
                key={attachment.id}
                className="group flex items-center gap-3 rounded-lg bg-surface-2/50 backdrop-blur-sm border border-white/5 p-3 transition-all hover:border-white/10"
              >
                {/* Preview or icon */}
                <div className="flex-shrink-0 rounded-lg overflow-hidden bg-surface-3/50">
                  {isImage ? (
                    <img
                      src={attachment.url}
                      alt={attachment.fileName ?? 'attachment'}
                      className="h-10 w-10 object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-text-secondary" />
                    </div>
                  )}
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
                  onClick={() => void handleDelete(attachment.id)}
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

      {/* Add link section */}
      <div className="border-t border-border-subtle pt-2">
        {showForm ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
              Add link
            </p>
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
                onClick={() => void handleAdd()}
                disabled={!url.trim() || isAdding}
                className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all duration-200"
              >
                {isAdding ? 'Adding...' : 'Add link'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-3/30 transition-colors w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            Add link attachment
          </button>
        )}
      </div>
    </div>
  );
}
