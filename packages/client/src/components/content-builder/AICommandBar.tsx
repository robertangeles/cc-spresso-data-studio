import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Wand2 } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { PromptBadge } from './PromptBadge';
import type { Prompt } from '../../hooks/usePrompts';

interface AICommandBarProps {
  onCommand: (instruction: string) => void;
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
      <div className="kr-cmd-idle relative bg-surface-1 backdrop-blur-sm rounded-xl border border-accent/20 shadow-[0_0_10px_rgba(255,214,10,0.05)] hover:border-accent/30 hover:shadow-[0_0_15px_rgba(255,214,10,0.08)] transition-all">
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
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="text-[10px] text-text-tertiary font-medium px-2 py-1 rounded-lg bg-surface-2 border border-border-subtle hover:border-border-default focus:border-accent/40 focus:outline-none cursor-pointer appearance-none pr-5 transition-colors"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activePromptName
                ? `Refine your ${activePromptName} output...`
                : 'Tell Spresso what content to create...'
            }
            rows={4}
            disabled={isProcessing}
            className="w-full resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 min-h-[96px] leading-6"
          />
          <p className="text-[10px] text-text-tertiary/50 text-right">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}
