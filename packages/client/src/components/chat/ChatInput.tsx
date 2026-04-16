import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Plus, Image as ImageIcon, Search, Globe, X, Paperclip } from 'lucide-react';
import { ModelSelector } from '../ui/ModelSelector';

function compressAndConvert(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

interface ChatInputProps {
  onSend: (content: string, imageUrls?: string[]) => void;
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  imageMode?: boolean;
  onImageModeToggle?: () => void;
  researchMode?: boolean;
  onResearchToggle?: () => void;
  webSearchMode?: boolean;
  onWebSearchToggle?: () => void;
}

export function ChatInput({
  onSend,
  model,
  onModelChange,
  disabled,
  imageMode,
  onImageModeToggle,
  researchMode,
  onResearchToggle,
  webSearchMode,
  onWebSearchToggle,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [toolsPos, setToolsPos] = useState<{ left: number; bottom: number } | null>(null);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close tools on click outside (check both the button container and the fixed dropdown)
  useEffect(() => {
    if (!showTools) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inRef = toolsRef.current?.contains(target);
      // Also check if click is inside the fixed dropdown
      const dropdown = document.querySelector('.fixed.w-56.rounded-xl');
      const inDropdown = dropdown?.contains(target);
      if (!inRef && !inDropdown) setShowTools(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTools]);

  // Add images from File objects
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

  // Paste handler
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

  // Drag-and-drop handlers
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
      const files = Array.from(e.dataTransfer.files);
      addImages(files);
    },
    [addImages],
  );

  // Convert images to base64 and send
  const handleSend = async () => {
    const hasText = input.trim().length > 0;
    const hasImages = attachedImages.length > 0;
    if ((!hasText && !hasImages) || disabled) return;

    let base64Images: string[] | undefined;

    if (hasImages) {
      base64Images = await Promise.all(attachedImages.map((f) => compressAndConvert(f)));
    }

    onSend(input.trim(), base64Images);
    setInput('');
    setAttachedImages([]);
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviewUrls([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Active modes shown as pills
  const activeModes = [
    ...(researchMode ? [{ label: 'Research', onRemove: onResearchToggle }] : []),
    ...(webSearchMode ? [{ label: 'Web Search', onRemove: onWebSearchToggle }] : []),
    ...(imageMode ? [{ label: 'Image', onRemove: onImageModeToggle }] : []),
  ];

  const hasContent = input.trim().length > 0 || attachedImages.length > 0;

  return (
    <div className="bg-surface-1 border-t border-border-subtle px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        {/* Active mode pills */}
        {activeModes.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {activeModes.map((m) => (
              <span
                key={m.label}
                className="inline-flex items-center gap-1 rounded-full bg-accent-dim border border-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-accent"
              >
                {m.label}
                <button
                  type="button"
                  onClick={m.onRemove}
                  className="hover:text-status-error transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Knight Rider scanning border animation */}
        <style>{`
          @keyframes kr-scan {
            0% { left: -35%; }
            50% { left: 100%; }
            100% { left: -35%; }
          }
          .kr-idle::before {
            content: '';
            position: absolute;
            top: -1px;
            left: -35%;
            width: 35%;
            height: 3px;
            background: radial-gradient(ellipse, rgba(255,214,10,1) 0%, rgba(255,214,10,0.5) 40%, transparent 70%);
            animation: kr-scan 5s ease-in-out infinite;
            z-index: 20;
            filter: drop-shadow(0 0 4px rgba(255,214,10,0.4));
          }
          .kr-idle::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 100%;
            width: 35%;
            height: 2px;
            background: radial-gradient(ellipse, rgba(255,214,10,0.7) 0%, rgba(255,214,10,0.3) 40%, transparent 70%);
            animation: kr-scan 5s ease-in-out infinite;
            animation-delay: -2.5s;
            z-index: 20;
            filter: drop-shadow(0 0 6px rgba(255,214,10,0.7));
          }
        `}</style>

        {/* Input box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl border bg-surface-2 transition-all duration-300 ease-spring ${
            isDragOver
              ? 'border-accent/60 shadow-glow-accent ring-2 ring-accent/20'
              : hasContent
                ? 'border-accent/40 shadow-glow-accent'
                : 'border-border-default focus-within:border-accent/40 focus-within:shadow-glow-accent'
          } ${!hasContent ? 'kr-idle' : ''}`}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-accent/5 backdrop-blur-sm">
              <p className="text-sm font-medium text-accent">Drop images here</p>
            </div>
          )}

          {/* Image preview thumbnails */}
          {imagePreviewUrls.length > 0 && (
            <div className="flex gap-2 px-4 pt-3 flex-wrap">
              {imagePreviewUrls.map((url, i) => (
                <div
                  key={url}
                  className="relative group rounded-lg overflow-hidden border border-border-subtle h-16 w-16 flex-shrink-0"
                >
                  <img src={url} alt={`Attached ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              imageMode
                ? 'Describe the image...'
                : webSearchMode
                  ? 'Search the web...'
                  : researchMode
                    ? 'What should I research?'
                    : 'Drop an idea...'
            }
            rows={2}
            disabled={disabled}
            className="w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3 pb-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          />

          {/* Hidden file input */}
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

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: attach + tools */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg p-1.5 border border-border-subtle bg-surface-3/60 text-text-secondary hover:bg-surface-3 hover:text-text-primary hover:border-border-hover transition-all duration-200"
                title="Attach images"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div ref={toolsRef} className="relative">
                <button
                  ref={plusBtnRef}
                  type="button"
                  onClick={() => {
                    if (!showTools && plusBtnRef.current) {
                      const rect = plusBtnRef.current.getBoundingClientRect();
                      setToolsPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
                    }
                    setShowTools(!showTools);
                  }}
                  className={`rounded-lg p-1.5 border transition-all duration-200 ${showTools ? 'bg-accent/10 border-accent/30 text-accent rotate-45' : 'border-border-subtle bg-surface-3/60 text-text-secondary hover:bg-surface-3 hover:text-text-primary hover:border-border-hover'}`}
                >
                  <Plus className="h-4 w-4" />
                </button>

                {/* Tools dropdown — fixed position to escape stacking contexts */}
                {showTools && toolsPos && (
                  <div
                    className="fixed w-56 rounded-xl border border-border-hover bg-surface-3 py-2 shadow-dark-lg backdrop-blur-glass z-[100] animate-scale-in"
                    style={{ left: toolsPos.left, bottom: toolsPos.bottom }}
                  >
                    <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                      Tools
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onResearchToggle?.();
                        setShowTools(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-all duration-150 ${researchMode ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-surface-4'}`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${researchMode ? 'bg-accent/20' : 'bg-surface-2 border border-border-subtle'}`}
                      >
                        <Search className="h-3.5 w-3.5" />
                      </span>
                      Research
                      {researchMode && (
                        <span className="ml-auto text-accent text-xs">&#10003;</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onWebSearchToggle?.();
                        setShowTools(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-all duration-150 ${webSearchMode ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-surface-4'}`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${webSearchMode ? 'bg-accent/20' : 'bg-surface-2 border border-border-subtle'}`}
                      >
                        <Globe className="h-3.5 w-3.5" />
                      </span>
                      Web search
                      {webSearchMode && (
                        <span className="ml-auto text-accent text-xs">&#10003;</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onImageModeToggle?.();
                        setShowTools(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-all duration-150 ${imageMode ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-surface-4'}`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${imageMode ? 'bg-accent/20' : 'bg-surface-2 border border-border-subtle'}`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                      </span>
                      Generate image
                      {imageMode && <span className="ml-auto text-accent text-xs">&#10003;</span>}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: model + send */}
            <div className="flex items-center gap-2">
              <ModelSelector value={model} onChange={onModelChange} allowAuto compact />
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || !hasContent}
                className={`rounded-xl p-2 transition-all duration-200 ${
                  hasContent
                    ? 'bg-accent text-text-inverse hover:bg-accent-hover animate-glow-pulse'
                    : 'bg-surface-3 text-text-tertiary'
                } disabled:opacity-30`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-text-tertiary">
          Enter to send &middot; Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
