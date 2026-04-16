import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Wand2, Paperclip, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { PromptBadge } from './PromptBadge';
import type { Prompt } from '../../hooks/usePrompts';

interface AICommandBarProps {
  onCommand: (instruction: string, imageUrls?: string[]) => void;
  isProcessing: boolean;
  isSending?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  activePromptId: string | null;
  activePromptName: string | null;
  onSelectPrompt: (promptId: string, name: string, body: string) => void;
  onClearPrompt: () => void;
  onCreateNewPrompt: () => void;
  prompts: Prompt[];
  promptsLoading: boolean;
  onDeletePrompt?: (id: string) => void;
  onEditPrompt?: (prompt: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  }) => void;
}

export function AICommandBar({
  onCommand,
  isProcessing,
  isSending,
  model,
  onModelChange,
  activePromptId,
  activePromptName,
  onSelectPrompt,
  onClearPrompt,
  onCreateNewPrompt,
  prompts,
  promptsLoading,
  onDeletePrompt,
  onEditPrompt,
}: AICommandBarProps) {
  const { models: configuredModels } = useConfiguredModels();
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize the textarea (single line default, expands on Shift+Enter)
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  const addImages = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setAttachedImages((prev) => [...prev, ...imageFiles]);
    const urls = imageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviewUrls((prev) => [...prev, ...urls]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviewUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        addImages(files);
      }
    },
    [addImages],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      addImages(Array.from(e.dataTransfer.files));
    },
    [addImages],
  );

  const handleSend = async () => {
    const hasText = input.trim().length > 0;
    const hasImages = attachedImages.length > 0;
    if ((!hasText && !hasImages) || isProcessing || isUploading) return;

    let uploadedUrls: string[] | undefined;

    if (hasImages) {
      setIsUploading(true);
      try {
        uploadedUrls = await Promise.all(
          attachedImages.map(async (file) => {
            const formData = new FormData();
            formData.append('image', file);
            const { data } = await api.post('/upload/image', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            return data.data.url as string;
          }),
        );
      } catch (err) {
        console.error('Image upload failed:', err);
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    onCommand(input.trim(), uploadedUrls);
    setAttachedImages([]);
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviewUrls([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = input.trim().length > 0 || attachedImages.length > 0;

  return (
    <div className="space-y-2">
      {/* Knight Rider scanning border animation */}
      <style>{`
        @keyframes kr-cmd-scan {
          0% { left: -35%; }
          50% { left: 100%; }
          100% { left: -35%; }
        }
        .kr-cmd-idle::before {
          content: '';
          position: absolute;
          top: -1px;
          left: -35%;
          width: 35%;
          height: 3px;
          background: radial-gradient(ellipse, rgba(255,214,10,1) 0%, rgba(255,214,10,0.5) 40%, transparent 70%);
          animation: kr-cmd-scan 5s ease-in-out infinite;
          z-index: 20;
          filter: drop-shadow(0 0 4px rgba(255,214,10,0.4));
        }
        .kr-cmd-idle::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 100%;
          width: 35%;
          height: 2px;
          background: radial-gradient(ellipse, rgba(255,214,10,0.7) 0%, rgba(255,214,10,0.3) 40%, transparent 70%);
          animation: kr-cmd-scan 5s ease-in-out infinite;
          animation-delay: -2.5s;
          z-index: 20;
          filter: drop-shadow(0 0 6px rgba(255,214,10,0.7));
        }
      `}</style>

      {/* Input card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`kr-cmd-idle relative bg-surface-1 backdrop-blur-sm rounded-xl border shadow-[0_0_10px_rgba(255,214,10,0.05)] hover:border-accent/30 hover:shadow-[0_0_15px_rgba(255,214,10,0.08)] transition-all ${
          isDragOver ? 'border-accent/60 ring-2 ring-accent/20' : 'border-accent/20'
        }`}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-accent/5 backdrop-blur-sm">
            <p className="text-sm font-medium text-accent">Drop images here</p>
          </div>
        )}
        {/* Toolbar row */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <PromptBadge
              activePromptId={activePromptId}
              activePromptName={activePromptName}
              isSending={isSending}
              onSelectPrompt={onSelectPrompt}
              onClearPrompt={onClearPrompt}
              onCreateNew={onCreateNewPrompt}
              prompts={prompts}
              loading={promptsLoading}
              onDeletePrompt={onDeletePrompt}
              onEditPrompt={onEditPrompt}
            />
            <span className="text-accent">
              <Wand2 className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-1 text-text-tertiary hover:text-text-secondary transition-colors"
              title="Attach images"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="text-xs text-text-secondary font-medium px-2 py-1 rounded-lg bg-surface-2 border border-border-subtle hover:border-border-default focus:border-accent/40 focus:outline-none cursor-pointer appearance-none pr-6 transition-colors max-w-[200px] truncate"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {configuredModels.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSend}
              disabled={!hasContent || isProcessing}
              className={`rounded-lg p-2 transition-all ${
                isProcessing
                  ? 'bg-accent/50 text-text-inverse'
                  : hasContent
                    ? 'bg-accent text-text-inverse hover:bg-accent-hover shadow-[0_0_10px_rgba(255,214,10,0.2)]'
                    : 'bg-surface-2 text-text-tertiary'
              } disabled:opacity-30`}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="px-3 py-2">
          {/* Image previews */}
          {imagePreviewUrls.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {imagePreviewUrls.map((url, i) => (
                <div
                  key={url}
                  className="relative group rounded-lg overflow-hidden border border-border-subtle h-14 w-14 flex-shrink-0"
                >
                  <img src={url} alt={`Attached ${i + 1}`} className="h-full w-full object-cover" />
                  {isUploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-3 w-3 text-accent animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              activePromptName
                ? `Refine your ${activePromptName} output...`
                : 'Tell Spresso what content to create...'
            }
            rows={1}
            disabled={isProcessing}
            className="w-full resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 min-h-[24px] max-h-[120px] leading-6"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                addImages(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />
          <p className="text-[10px] text-text-tertiary/50 text-right">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}
