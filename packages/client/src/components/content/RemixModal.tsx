import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, ExternalLink, Check, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { PlatformPicker, getPlatformColor } from './PlatformPicker';
import { StylePicker } from './StylePicker';
import { useRemix } from '../../hooks/useRemix';
import type { ContentItem, Channel } from '../../hooks/useContent';

interface RemixModalProps {
  isOpen: boolean;
  sourceItems: ContentItem[];
  channels: Channel[];
  onClose: () => void;
  onQuickRemixComplete: () => void;
  onDeepRemix: (config: {
    sourceItems: ContentItem[];
    targetChannelIds: string[];
    style: string;
    customPrompt?: string;
  }) => void;
}

export function RemixModal({
  isOpen,
  sourceItems,
  channels,
  onClose,
  onQuickRemixComplete,
  onDeepRemix,
}: RemixModalProps) {
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [style, setStyle] = useState('remix-punchy');
  const [customPrompt, setCustomPrompt] = useState('');

  const { remix, cancel, isRemixing, progress, error } = useRemix();

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRemixing) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isRemixing, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedChannels(new Set());
      setStyle('remix-punchy');
      setCustomPrompt('');
    }
  }, [isOpen]);

  const handleToggleChannel = useCallback((id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllChannels = useCallback(() => {
    setSelectedChannels(new Set(channels.map((c) => c.id)));
  }, [channels]);

  const handleClearAllChannels = useCallback(() => {
    setSelectedChannels(new Set());
  }, []);

  const canSubmit =
    selectedChannels.size > 0 && (style !== 'custom' || customPrompt.trim().length > 0);

  const handleQuickRemix = useCallback(() => {
    remix(
      {
        sourceContentIds: sourceItems.map((i) => i.id),
        targetChannelIds: Array.from(selectedChannels),
        style,
        customPrompt: customPrompt.trim() || undefined,
      },
      () => onQuickRemixComplete(),
    );
  }, [sourceItems, selectedChannels, style, customPrompt, remix, onQuickRemixComplete]);

  const handleDeepRemix = useCallback(() => {
    onDeepRemix({
      sourceItems,
      targetChannelIds: Array.from(selectedChannels),
      style,
      customPrompt: customPrompt.trim() || undefined,
    });
  }, [sourceItems, selectedChannels, style, customPrompt, onDeepRemix]);

  if (!isOpen) return null;

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRemixing) onClose();
      }}
    >
      {/* Slide-in drawer */}
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-border-subtle bg-surface-1/95 backdrop-blur-xl shadow-dark-lg animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface-1/90 backdrop-blur-md px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-amber-600/10 border border-accent/10">
              <Sparkles className="h-4.5 w-4.5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Remix Content</h2>
              <p className="text-[11px] text-text-tertiary">
                {sourceItems.length} source{sourceItems.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isRemixing) onClose();
              else cancel();
            }}
            className="rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Source preview */}
          <div>
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
              Source Content
            </span>
            <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-border-subtle bg-surface-2/40 p-3">
              {sourceItems.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  {item.channelId && channelMap.get(item.channelId) && (
                    <span className="text-sm shrink-0 mt-0.5">
                      {channelMap.get(item.channelId)!.icon}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{item.title}</p>
                    <p className="text-[11px] text-text-tertiary line-clamp-1">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform picker */}
          <PlatformPicker
            channels={channels}
            selected={selectedChannels}
            onToggle={handleToggleChannel}
            onSelectAll={handleSelectAllChannels}
            onClearAll={handleClearAllChannels}
          />

          {/* Style picker */}
          <StylePicker
            selected={style}
            onSelect={setStyle}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
          />

          {/* Streaming progress */}
          {isRemixing && (
            <div className="animate-slide-up">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Generating...
              </span>
              <div className="space-y-2">
                {/* Show completed channels */}
                {progress.map((p) => (
                  <ProgressItem
                    key={p.channelId}
                    channelName={p.channelName}
                    channelId={p.channelId}
                    channels={channels}
                    status="done"
                  />
                ))}
                {/* Show pending channels */}
                {Array.from(selectedChannels)
                  .filter((id) => !progress.some((p) => p.channelId === id))
                  .map((id) => {
                    const ch = channelMap.get(id);
                    const isNext = progress.length === Array.from(selectedChannels).indexOf(id);
                    return (
                      <ProgressItem
                        key={id}
                        channelName={ch?.name ?? 'Unknown'}
                        channelId={id}
                        channels={channels}
                        status={isNext ? 'active' : 'pending'}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error animate-slide-up">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 border-t border-border-subtle bg-surface-1/90 backdrop-blur-md px-6 py-4">
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleQuickRemix}
              disabled={!canSubmit || isRemixing}
              className="flex-1 gap-2"
            >
              {isRemixing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Remixing ({progress.length}/{selectedChannels.size})
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Quick Remix
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDeepRemix}
              disabled={!canSubmit || isRemixing}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Studio
            </Button>
          </div>
          {!isRemixing && (
            <p className="mt-2 text-center text-[10px] text-text-tertiary">
              Quick Remix generates drafts here. Open in Studio for hands-on editing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Progress item ───────────────────────────── */

function ProgressItem({
  channelName,
  channelId,
  channels,
  status,
}: {
  channelName: string;
  channelId: string;
  channels: Channel[];
  status: 'done' | 'active' | 'pending';
}) {
  const channel = channels.find((c) => c.id === channelId);
  const color = channel ? getPlatformColor(channel.slug) : '#6B7280';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-300
      ${status === 'done' ? 'bg-emerald-500/5 border border-emerald-500/10' : ''}
      ${status === 'active' ? 'bg-accent/5 border border-accent/10' : ''}
      ${status === 'pending' ? 'bg-surface-2/30 border border-transparent opacity-50' : ''}
    `}
    >
      {/* Platform icon */}
      <span
        className="flex h-6 w-6 items-center justify-center rounded text-xs"
        style={{ background: `${color}15` }}
      >
        {channel?.icon ?? '📄'}
      </span>

      <span className="text-xs font-medium text-text-primary flex-1">{channelName}</span>

      {/* Status indicator */}
      {status === 'done' && <Check className="h-4 w-4 text-emerald-400" />}
      {status === 'active' && <Loader2 className="h-4 w-4 text-accent animate-spin" />}
      {status === 'pending' && <div className="h-4 w-4" />}
    </div>
  );
}
