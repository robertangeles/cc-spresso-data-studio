import { useState, useRef, useEffect } from 'react';
import { Send, Check, Loader2, Wand2, RotateCcw } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { PromptBadge } from './PromptBadge';

interface AICommandBarProps {
  onCommand: (instruction: string) => void;
  isProcessing: boolean;
  commandHistory: Array<{ instruction: string; timestamp: string }>;
  model: string;
  onModelChange: (model: string) => void;
  activePromptId: string | null;
  activePromptName: string | null;
  onSelectPrompt: (promptId: string, name: string, body: string) => void;
  onClearPrompt: () => void;
  onCreateNewPrompt: () => void;
  onEditPrompt?: (prompt: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  }) => void;
  onRegenerate?: (instruction: string) => void;
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AICommandBar({
  onCommand,
  isProcessing,
  commandHistory,
  model,
  onModelChange,
  activePromptId,
  activePromptName,
  onSelectPrompt,
  onClearPrompt,
  onCreateNewPrompt,
  onEditPrompt,
  onRegenerate,
}: AICommandBarProps) {
  const { models: configuredModels } = useConfiguredModels();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea (single line default, expands on Shift+Enter)
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onCommand(input.trim());
    // Don't clear input — keep it visible so user can see what they sent
    // It clears when they start typing something new or on publish
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = input.trim().length > 0;
  const visibleHistory = commandHistory.slice(-3);
  const showWelcome = visibleHistory.length === 0 && !isProcessing;

  return (
    <div className="space-y-2">
      {/* Welcome hint — shown when no commands yet */}
      {showWelcome && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/[0.04] border border-accent/10 animate-slide-up">
          <Wand2 className="h-3.5 w-3.5 text-accent/60 shrink-0" />
          <p className="text-[11px] text-text-tertiary">
            <span className="text-accent/80 font-medium">AI Co-pilot ready.</span> Try: &ldquo;Write
            a launch post for my product&rdquo; or &ldquo;Make this more conversational&rdquo;
          </p>
        </div>
      )}

      {/* Command history — collapsed list above the bar */}
      {visibleHistory.length > 0 && (
        <div className="max-h-[90px] overflow-y-auto space-y-0.5 scrollbar-thin">
          {visibleHistory.map((cmd, i) => {
            const isLast = i === visibleHistory.length - 1;
            return (
              <div
                key={`${cmd.timestamp}-${i}`}
                className="flex items-center gap-2 text-xs text-text-secondary px-1 py-0.5"
              >
                <Check className="h-3 w-3 text-green-400 shrink-0" />
                <span className="truncate flex-1">{cmd.instruction}</span>
                {isLast && onRegenerate && !isProcessing && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(cmd.instruction)}
                    className="shrink-0 flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover transition-colors"
                    title="Regenerate with this instruction"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                )}
                <span className="shrink-0 text-[10px] text-text-tertiary/60">
                  {relativeTime(cmd.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}

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

      {/* Input bar */}
      <div className="kr-cmd-idle relative overflow-hidden flex items-center gap-2 bg-surface-1 backdrop-blur-sm rounded-xl border border-accent/20 px-3 py-2 shadow-[0_0_10px_rgba(255,214,10,0.05)] hover:border-accent/30 hover:shadow-[0_0_15px_rgba(255,214,10,0.08)] transition-all">
        {/* Prompt badge */}
        <PromptBadge
          activePromptId={activePromptId}
          activePromptName={activePromptName}
          onSelectPrompt={onSelectPrompt}
          onClearPrompt={onClearPrompt}
          onCreateNew={onCreateNewPrompt}
          onEditPrompt={onEditPrompt}
        />

        {/* AI icon */}
        <span className="shrink-0 text-accent">
          <Wand2 className="h-4 w-4" />
        </span>

        {/* Input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell the AI what to write..."
          rows={4}
          disabled={isProcessing}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 min-h-[96px] leading-6"
        />

        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="text-[10px] text-text-tertiary font-medium px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle hover:border-border-default focus:border-accent/40 focus:outline-none cursor-pointer appearance-none pr-4 transition-colors shrink-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 4px center',
          }}
        >
          {configuredModels.map((m) => (
            <option key={m.model} value={m.model}>
              {m.displayName}
            </option>
          ))}
        </select>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasContent || isProcessing}
          className={`rounded-lg p-1.5 transition-all shrink-0 ${
            isProcessing
              ? 'bg-accent/50 text-text-inverse'
              : hasContent
                ? 'bg-accent text-text-inverse hover:bg-accent-hover'
                : 'bg-surface-2 text-text-tertiary'
          } disabled:opacity-30`}
        >
          {isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
