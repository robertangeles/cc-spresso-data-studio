import { useState, useCallback, useEffect } from 'react';
import {
  X,
  Import,
  ExternalLink,
  Globe,
  FileText,
  Loader2,
  Check,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { PlatformPicker, getPlatformColor } from './PlatformPicker';
import { StylePicker } from './StylePicker';
import { useRepurpose } from '../../hooks/useRepurpose';
import type { Channel } from '../../hooks/useContent';

interface RepurposeModalProps {
  isOpen: boolean;
  channels: Channel[];
  onClose: () => void;
  onQuickRepurposeComplete: () => void;
  onDeepRepurpose: (config: {
    sourceText: string;
    sourceUrl?: string;
    targetChannelIds: string[];
    style: string;
    customPrompt?: string;
  }) => void;
}

type Tab = 'paste' | 'url';

export function RepurposeModal({
  isOpen,
  channels,
  onClose,
  onQuickRepurposeComplete,
  onDeepRepurpose,
}: RepurposeModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('paste');
  const [pasteText, setPasteText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [scrapedText, setScrapedText] = useState('');
  const [scrapedTitle, setScrapedTitle] = useState('');
  const [scrapedUrl, setScrapedUrl] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [style, setStyle] = useState('remix-punchy');
  const [customPrompt, setCustomPrompt] = useState('');

  const { scrapeUrl, repurpose, cancel, isScraping, isRepurposing, progress, error } =
    useRepurpose();

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRepurposing) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isRepurposing, onClose]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('paste');
      setPasteText('');
      setUrlInput('');
      setScrapedText('');
      setScrapedTitle('');
      setScrapedUrl('');
      setSelectedChannels(new Set());
      setStyle('remix-punchy');
      setCustomPrompt('');
    }
  }, [isOpen]);

  const handleScrape = useCallback(async () => {
    try {
      const result = await scrapeUrl(urlInput.trim());
      setScrapedText(result.body);
      setScrapedTitle(result.title);
      setScrapedUrl(result.source);
    } catch {
      // Error handled by hook
    }
  }, [urlInput, scrapeUrl]);

  const sourceText = activeTab === 'paste' ? pasteText : scrapedText;
  const sourceUrl = activeTab === 'url' ? scrapedUrl : undefined;
  const hasSource = sourceText.trim().length > 20;
  const canSubmit =
    hasSource &&
    selectedChannels.size > 0 &&
    (style !== 'custom' || customPrompt.trim().length > 0);

  const handleQuickRepurpose = useCallback(() => {
    repurpose(
      {
        sourceText,
        sourceUrl,
        targetChannelIds: Array.from(selectedChannels),
        style,
        customPrompt: customPrompt.trim() || undefined,
      },
      () => onQuickRepurposeComplete(),
    );
  }, [
    sourceText,
    sourceUrl,
    selectedChannels,
    style,
    customPrompt,
    repurpose,
    onQuickRepurposeComplete,
  ]);

  const handleDeepRepurpose = useCallback(() => {
    onDeepRepurpose({
      sourceText,
      sourceUrl,
      targetChannelIds: Array.from(selectedChannels),
      style,
      customPrompt: customPrompt.trim() || undefined,
    });
  }, [sourceText, sourceUrl, selectedChannels, style, customPrompt, onDeepRepurpose]);

  const handleToggleChannel = useCallback((id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRepurposing) onClose();
      }}
    >
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-border-subtle bg-surface-1/95 backdrop-blur-xl shadow-dark-lg animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface-1/90 backdrop-blur-md px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/10 border border-emerald-500/10">
              <Import className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Import & Repurpose</h2>
              <p className="text-[11px] text-text-tertiary">
                Turn external content into platform-native posts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isRepurposing) onClose();
              else cancel();
            }}
            className="rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Tab bar */}
          <div className="flex rounded-lg border border-border-subtle bg-surface-2/40 p-1">
            {[
              { id: 'paste' as Tab, icon: FileText, label: 'Paste Text' },
              { id: 'url' as Tab, icon: Globe, label: 'From URL' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? 'bg-surface-3 text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Paste Text tab */}
          {activeTab === 'paste' && (
            <div className="animate-fade-in">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Source Content
              </span>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a blog post, article, transcript, notes, or any content you want to repurpose..."
                rows={8}
                maxLength={50000}
                className="w-full rounded-lg border border-border-default bg-surface-2/60 backdrop-blur-sm px-3 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none transition-all duration-200 leading-relaxed"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-text-tertiary">
                  {pasteText.length > 20
                    ? `${pasteText.length.toLocaleString()} chars`
                    : 'Minimum 20 characters'}
                </span>
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {pasteText.length.toLocaleString()}/50,000
                </span>
              </div>
            </div>
          )}

          {/* From URL tab */}
          {activeTab === 'url' && (
            <div className="animate-fade-in space-y-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
                Source URL
              </span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://blog.example.com/article"
                    className="w-full rounded-lg border border-border-default bg-surface-2/60 backdrop-blur-sm pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleScrape}
                  disabled={!urlInput.trim() || isScraping}
                  className="gap-1.5 shrink-0"
                >
                  {isScraping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  {isScraping ? 'Extracting...' : 'Extract'}
                </Button>
              </div>

              {/* Scraped content preview */}
              {scrapedText && (
                <div className="animate-slide-up">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Content extracted
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {scrapedText.length.toLocaleString()} chars
                    </span>
                  </div>
                  {scrapedTitle && (
                    <p className="text-xs font-medium text-text-primary mb-1 truncate">
                      {scrapedTitle}
                    </p>
                  )}
                  <textarea
                    value={scrapedText}
                    onChange={(e) => setScrapedText(e.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-2 text-xs text-text-secondary leading-relaxed resize-none focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    You can edit the extracted text before repurposing.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Platform picker */}
          <PlatformPicker
            channels={channels}
            selected={selectedChannels}
            onToggle={handleToggleChannel}
            onSelectAll={() => setSelectedChannels(new Set(channels.map((c) => c.id)))}
            onClearAll={() => setSelectedChannels(new Set())}
          />

          {/* Style picker */}
          <StylePicker
            selected={style}
            onSelect={setStyle}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
          />

          {/* Streaming progress */}
          {isRepurposing && (
            <div className="animate-slide-up">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Generating...
              </span>
              <div className="space-y-2">
                {progress.map((p) => (
                  <ProgressItem
                    key={p.channelId}
                    channelName={p.channelName}
                    channelId={p.channelId}
                    channels={channels}
                    status="done"
                  />
                ))}
                {Array.from(selectedChannels)
                  .filter((id) => !progress.some((p) => p.channelId === id))
                  .map((id) => {
                    const ch = channels.find((c) => c.id === id);
                    return (
                      <ProgressItem
                        key={id}
                        channelName={ch?.name ?? 'Unknown'}
                        channelId={id}
                        channels={channels}
                        status="pending"
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error animate-slide-up">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border-subtle bg-surface-1/90 backdrop-blur-md px-6 py-4">
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleQuickRepurpose}
              disabled={!canSubmit || isRepurposing}
              className="flex-1 gap-2"
            >
              {isRepurposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating ({progress.length}/{selectedChannels.size})
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Quick Generate
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDeepRepurpose}
              disabled={!canSubmit || isRepurposing}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Studio
            </Button>
          </div>
          {!isRepurposing && (
            <p className="mt-2 text-center text-[10px] text-text-tertiary">
              Quick Generate creates drafts here. Open in Studio for hands-on editing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressItem({
  channelName,
  channelId,
  channels,
  status,
}: {
  channelName: string;
  channelId: string;
  channels: Channel[];
  status: 'done' | 'pending';
}) {
  const channel = channels.find((c) => c.id === channelId);
  const color = channel ? getPlatformColor(channel.slug) : '#6B7280';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-300
      ${status === 'done' ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-surface-2/30 border border-transparent opacity-50'}
    `}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded text-xs"
        style={{ background: `${color}15` }}
      >
        {channel?.icon ?? '📄'}
      </span>
      <span className="text-xs font-medium text-text-primary flex-1">{channelName}</span>
      {status === 'done' ? (
        <Check className="h-4 w-4 text-emerald-400" />
      ) : (
        <div className="h-4 w-4" />
      )}
    </div>
  );
}
