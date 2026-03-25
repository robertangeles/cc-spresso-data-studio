import { useState, useRef, useCallback } from 'react';
import { Upload, X, RefreshCw, Loader2, Image } from 'lucide-react';

interface MediaStudioProps {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  selectedChannels: Array<{ id: string; name: string; slug: string; config: any }>;
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
  const w = first.config?.imageWidth;
  const h = first.config?.imageHeight;
  if (w && h) {
    return { width: w, height: h, label: first.name };
  }
  return null;
}

export default function MediaStudio({
  imageUrl,
  onImageChange,
  selectedChannels,
}: MediaStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [activePreset, setActivePreset] = useState<StylePresetId>('realistic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedDims = getSuggestedDimensions(selectedChannels);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
      const previewUrl = URL.createObjectURL(file);
      onImageChange(previewUrl);
    },
    [onImageChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      // Reset so the same file can be selected again
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
    // Placeholder — backend endpoint not yet available
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

  /* ── Image preview state ─────────────────────────────────── */
  if (imageUrl) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
        {/* Preview */}
        <div className="relative group rounded-lg overflow-hidden">
          <img
            src={imageUrl}
            alt="Media preview"
            className="w-full max-h-72 object-cover rounded-lg"
          />
          {/* Overlay buttons */}
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

        {/* Per-platform dimension recommendations */}
        {selectedChannels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedChannels.map((ch) => {
              const w = ch.config?.imageWidth;
              const h = ch.config?.imageHeight;
              if (!w || !h) return null;
              return (
                <span
                  key={ch.id}
                  className="inline-flex items-center gap-1 text-xs text-text-tertiary bg-surface-3 px-2 py-0.5 rounded-full"
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

  /* ── Empty / upload state ────────────────────────────────── */
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          w-full flex flex-col items-center justify-center gap-2 py-8
          rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer
          ${
            isDragOver
              ? 'border-accent bg-accent/5 scale-[1.01] shadow-[0_0_20px_rgba(99,102,241,0.1)]'
              : 'border-border-default hover:border-border-hover hover:bg-surface-2/50'
          }
        `}
        style={isDragOver ? { animation: 'pulse 1.5s ease-in-out infinite' } : undefined}
      >
        <div
          className={`p-2.5 rounded-full transition-colors duration-200 ${
            isDragOver ? 'bg-accent/10 text-accent' : 'bg-surface-3 text-text-tertiary'
          }`}
        >
          <Upload size={20} />
        </div>
        <span className="text-sm text-text-tertiary">
          Drag &amp; drop or click to upload
        </span>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border-subtle" />
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          or generate with AI
        </span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your image..."
        rows={2}
        className="w-full bg-surface-3 text-sm text-text-primary placeholder-text-tertiary rounded-lg border border-border-subtle focus:border-accent focus:ring-1 focus:ring-accent/30 px-3 py-2 resize-none transition-all duration-150 outline-none"
      />

      {/* Style presets */}
      <div className="flex flex-wrap gap-2">
        {STYLE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setActivePreset(preset.id)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                border transition-all duration-150
                ${
                  isActive
                    ? 'bg-accent-dim text-accent border-accent shadow-sm'
                    : 'bg-surface-3 text-text-secondary border-border-subtle hover:border-border-hover hover:bg-surface-2'
                }
              `}
            >
              <span>{preset.icon}</span>
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Suggested size */}
      {suggestedDims && (
        <p className="text-xs text-text-tertiary">
          Recommended: {suggestedDims.width}&times;{suggestedDims.height} ({suggestedDims.label})
        </p>
      )}

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-text-inverse text-sm font-medium transition-all duration-150 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Image size={16} />
            Generate
          </>
        )}
      </button>
    </div>
  );
}
