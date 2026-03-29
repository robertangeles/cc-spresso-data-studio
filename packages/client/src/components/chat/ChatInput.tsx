import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Image as ImageIcon, Search, Globe, X } from 'lucide-react';
import { ModelSelector } from '../ui/ModelSelector';

interface ChatInputProps {
  onSend: (content: string) => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

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

  // Close tools on click outside
  useEffect(() => {
    if (!showTools) return;
    const handler = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setShowTools(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTools]);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
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

  const hasContent = input.trim().length > 0;

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
          className={`relative rounded-2xl border bg-surface-2 overflow-hidden transition-all duration-300 ease-spring ${
            hasContent
              ? 'border-accent/40 shadow-glow-accent'
              : 'border-border-default focus-within:border-accent/40 focus-within:shadow-glow-accent'
          } ${!hasContent ? 'kr-idle' : ''}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: + button */}
            <div ref={toolsRef} className="relative">
              <button
                type="button"
                onClick={() => setShowTools(!showTools)}
                className={`rounded-full p-1.5 transition-colors ${showTools ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:bg-surface-3 hover:text-text-secondary'}`}
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Tools dropdown */}
              {showTools && (
                <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-border-default bg-surface-2 py-1.5 shadow-dark-lg backdrop-blur-glass z-50 animate-scale-in">
                  <button
                    type="button"
                    onClick={() => {
                      onResearchToggle?.();
                      setShowTools(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface-3 transition-colors ${researchMode ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  >
                    <Search className="h-4 w-4" />
                    Research
                    {researchMode && <span className="ml-auto text-accent">&#10003;</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onWebSearchToggle?.();
                      setShowTools(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface-3 transition-colors ${webSearchMode ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  >
                    <Globe className="h-4 w-4" />
                    Web search
                    {webSearchMode && <span className="ml-auto text-accent">&#10003;</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onImageModeToggle?.();
                      setShowTools(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface-3 transition-colors ${imageMode ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  >
                    <ImageIcon className="h-4 w-4" />
                    Generate image
                    {imageMode && <span className="ml-auto text-accent">&#10003;</span>}
                  </button>
                </div>
              )}
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
