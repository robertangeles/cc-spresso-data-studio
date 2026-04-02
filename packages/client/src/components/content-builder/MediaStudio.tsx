import { useState, useRef, useCallback } from 'react';
import { Upload, X, RefreshCw, Loader2, Image, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../lib/api';

interface MediaStudioProps {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  selectedChannels: Array<{
    id: string;
    name: string;
    slug: string;
    config: Record<string, unknown>;
  }>;
  flowState?: string;
  nudge?: boolean;
}

const STYLE_PRESETS = [
  { id: 'realistic', label: 'Realistic', icon: '\u{1F4F7}', model: 'flux' },
  { id: 'creative', label: 'Creative', icon: '\u{1F3A8}', model: 'nano-banana' },
  { id: 'text', label: 'Text Overlay', icon: '\u{1F4DD}', model: 'gemini-image' },
  { id: 'meme', label: 'Meme', icon: '\u{1F602}', model: 'gemini-pro-image' },
  { id: 'video', label: 'AI Video', icon: '\u{1F3AC}', model: 'kling' },
] as const;

type StylePresetId = (typeof STYLE_PRESETS)[number]['id'];

function getSuggestedDimensions(
  channels: MediaStudioProps['selectedChannels'],
): { width: number; height: number; label: string } | null {
  if (channels.length === 0) return null;
  const first = channels[0];
  const w = first.config?.imageWidth as number | undefined;
  const h = first.config?.imageHeight as number | undefined;
  if (w && h) {
    return { width: w, height: h, label: first.name };
  }
  return null;
}

export default function MediaStudio({
  imageUrl,
  onImageChange,
  selectedChannels,
  nudge,
}: MediaStudioProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [activePreset, setActivePreset] = useState<StylePresetId>('realistic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedDims = getSuggestedDimensions(selectedChannels);

  const uploadToServer = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('image', file);
        const { data } = await api.post('/upload/image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        onImageChange(data.data.url);
      } catch (err) {
        console.error('Image upload failed:', err);
      } finally {
        setIsUploading(false);
      }
    },
    [onImageChange],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      uploadToServer(file);
    },
    [uploadToServer],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      e.target.value = '';
    },
    [handleFileSelect],
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
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      alert('AI image generation coming soon');
    }, 800);
  }, [prompt]);

  const handleRemove = useCallback(() => {
    onImageChange(null);
  }, [onImageChange]);

  const handleRegenerate = useCallback(() => {
    alert('AI regeneration coming soon');
  }, []);

  /* ── Collapsed bar ──────────────────────────────────────── */
  if (isCollapsed && !imageUrl) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        className={`inline-flex items-center gap-2 text-sm transition-colors py-1 ${
          nudge ? 'text-accent animate-pulse' : 'text-text-tertiary hover:text-text-secondary'
        } cursor-pointer`}
      >
        <Image size={15} />
        <span className="font-medium">Add Media</span>
        <ChevronDown size={14} />
      </button>
    );
  }

  /* ── Image preview state ────────────────────────────────── */
  if (imageUrl) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-3">
        <div className="relative group rounded-lg overflow-hidden inline-block">
          <img src={imageUrl} alt="Media preview" className="h-20 w-auto object-cover rounded-lg" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              <X size={14} />
              Remove
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium backdrop-blur-sm transition-colors"
            >
              <RefreshCw size={14} />
              Regenerate
            </button>
          </div>
        </div>

        {selectedChannels.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedChannels.map((ch) => {
              const w = ch.config?.imageWidth as number | undefined;
              const h = ch.config?.imageHeight as number | undefined;
              if (!w || !h) return null;
              return (
                <span
                  key={ch.id}
                  className="inline-flex items-center gap-1 text-xs text-text-secondary bg-surface-3 px-2 py-0.5 rounded-full"
                >
                  <Image size={10} />
                  {ch.name}: {w}&times;{h}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── Empty / upload state — two-column layout ──────────── */
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Media Studio</span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-all duration-200"
          aria-label="Collapse media studio"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Two-column: Upload | AI Generate */}
      <div className="flex gap-3">
        {/* Left: Upload zone */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={isUploading}
          className={`
            flex-1 flex flex-col items-center justify-center gap-2 py-6
            rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer
            ${
              isDragOver
                ? 'border-accent bg-accent/5 scale-[1.01]'
                : 'border-border-default hover:border-border-hover hover:bg-surface-2/50'
            }
            ${isUploading ? 'opacity-50 cursor-wait' : ''}
          `}
        >
          <div
            className={`p-2 rounded-full transition-colors ${
              isDragOver ? 'bg-accent/10 text-accent' : 'bg-surface-3 text-text-tertiary'
            }`}
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          </div>
          <span className="text-xs text-text-secondary">
            {isUploading ? 'Uploading...' : 'Drop or click'}
          </span>
        </button>

        {/* Vertical divider */}
        <div className="flex flex-col items-center gap-1 py-4">
          <div className="flex-1 w-px bg-border-subtle" />
          <span className="text-[9px] text-text-tertiary uppercase">or</span>
          <div className="flex-1 w-px bg-border-subtle" />
        </div>

        {/* Right: AI Generate */}
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your image..."
            rows={3}
            className="w-full flex-1 bg-surface-3 text-xs text-text-primary placeholder-text-tertiary rounded-lg border border-border-subtle focus:border-accent focus:ring-1 focus:ring-accent/30 px-2.5 py-2 resize-none transition-all duration-150 outline-none"
          />
          <div className="flex items-center gap-2">
            {/* Style dropdown — replaces pill buttons */}
            <select
              value={activePreset}
              onChange={(e) => setActivePreset(e.target.value as StylePresetId)}
              className="text-xs text-text-secondary font-medium px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border-subtle hover:border-border-hover focus:border-accent/40 focus:outline-none cursor-pointer transition-colors flex-1"
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.icon} {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-text-inverse text-xs font-medium transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
              Generate
            </button>
          </div>
        </div>
      </div>

      {/* Suggested size */}
      {suggestedDims && (
        <p className="text-xs text-text-secondary">
          Recommended: {suggestedDims.width}&times;{suggestedDims.height} ({suggestedDims.label})
        </p>
      )}
    </div>
  );
}
