import { Calendar, Send, Save, Loader2, Sparkles, Wand2 } from 'lucide-react';

interface ActionBarProps {
  activeDrawer: 'chat' | 'schedule' | null;
  onToggleDrawer: (drawer: 'chat' | 'schedule') => void;
  onSaveDraft: () => void;
  onPublishNow: () => void;
  isSaving: boolean;
  isDirty: boolean;
  flowState: string;
  selectedChannelCount: number;
  isAdapting: boolean;
  onAdaptAll: () => void;
}

export function ActionBar({
  activeDrawer,
  onToggleDrawer,
  onSaveDraft,
  onPublishNow,
  isSaving,
  isDirty,
  flowState,
  selectedChannelCount,
  isAdapting,
  onAdaptAll,
}: ActionBarProps) {
  const canPublish = selectedChannelCount > 0 && !isSaving;
  const showAdapt =
    selectedChannelCount >= 2 &&
    (flowState === 'PLATFORMS_SELECTED' ||
      flowState === 'ADAPTED' ||
      flowState === 'MEDIA_ADDED' ||
      flowState === 'READY');
  const isAdapted = flowState === 'ADAPTED' || flowState === 'MEDIA_ADDED' || flowState === 'READY';

  return (
    <div className="action-bar-glass sticky bottom-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
      {/* Left: Drawer toggles — prominent card-style buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleDrawer('chat')}
          className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-heading font-semibold transition-all duration-200 ease-spring ${
            activeDrawer === 'chat'
              ? 'bg-accent/15 text-accent border border-accent/30 shadow-[0_0_15px_rgba(255,214,10,0.12)]'
              : 'bg-surface-2/60 text-text-secondary hover:text-accent hover:bg-accent/10 hover:border-accent/20 border border-border-subtle hover:shadow-[0_0_10px_rgba(255,214,10,0.06)]'
          }`}
          title="Toggle AI Chat (Ctrl+/)"
        >
          <div
            className={`flex items-center justify-center h-6 w-6 rounded-lg transition-colors ${
              activeDrawer === 'chat' ? 'bg-accent/20' : 'bg-surface-3/60 group-hover:bg-accent/15'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <span>AI Chat</span>
          <kbd className="hidden md:inline text-[9px] text-text-tertiary/60 bg-surface-3/40 px-1.5 py-0.5 rounded font-mono">
            Ctrl /
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => onToggleDrawer('schedule')}
          className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-heading font-semibold transition-all duration-200 ease-spring ${
            activeDrawer === 'schedule'
              ? 'bg-accent/15 text-accent border border-accent/30 shadow-[0_0_15px_rgba(255,214,10,0.12)]'
              : 'bg-surface-2/60 text-text-secondary hover:text-accent hover:bg-accent/10 hover:border-accent/20 border border-border-subtle hover:shadow-[0_0_10px_rgba(255,214,10,0.06)]'
          }`}
          title="Toggle Schedule (Ctrl+Shift+S)"
        >
          <div
            className={`flex items-center justify-center h-6 w-6 rounded-lg transition-colors ${
              activeDrawer === 'schedule'
                ? 'bg-accent/20'
                : 'bg-surface-3/60 group-hover:bg-accent/15'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
          </div>
          <span>Schedule</span>
          {selectedChannelCount > 0 && (
            <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-bold tabular-nums">
              {selectedChannelCount}
            </span>
          )}
        </button>
      </div>

      {/* Center: Adapt All (contextual) */}
      {showAdapt && (
        <button
          type="button"
          onClick={onAdaptAll}
          disabled={isAdapting}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-heading font-bold transition-all duration-200 ease-spring ${
            isAdapted
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-gradient-to-r from-accent to-amber-600 text-text-inverse shadow-glow hover:shadow-glow-accent hover:scale-[1.03] active:scale-[0.97]'
          } disabled:opacity-50`}
        >
          {isAdapting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isAdapting ? 'Adapting...' : isAdapted ? 'Adapted' : 'Adapt All'}
        </button>
      )}

      {/* Right: Save + Publish */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-heading font-semibold text-text-secondary hover:text-text-primary bg-surface-2/40 hover:bg-surface-2/70 border border-border-subtle transition-all duration-200 disabled:opacity-25"
          title="Save Draft (Ctrl+S)"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        <button
          type="button"
          onClick={onPublishNow}
          disabled={!canPublish}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-600 px-5 py-2.5 text-sm font-heading font-bold text-text-inverse transition-all duration-200 ease-spring hover:from-accent-hover hover:to-amber-500 hover:scale-[1.03] hover:shadow-glow-accent active:scale-[0.97] disabled:opacity-25 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          <Send className="h-4 w-4" />
          <span>Publish</span>
        </button>
      </div>
    </div>
  );
}
