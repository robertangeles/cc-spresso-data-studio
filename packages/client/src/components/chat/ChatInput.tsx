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
  onSend, model, onModelChange, disabled,
  imageMode, onImageModeToggle,
  researchMode, onResearchToggle,
  webSearchMode, onWebSearchToggle,
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

  useEffect(() => { textareaRef.current?.focus(); }, []);

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

  return (
    <div className="bg-white px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        {/* Active mode pills */}
        {activeModes.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {activeModes.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1 rounded-full bg-accent-yellow/20 px-2.5 py-0.5 text-[11px] font-medium text-brand-700">
                {m.label}
                <button type="button" onClick={m.onRemove} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input box */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-brand-400 focus-within:shadow-md transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={imageMode ? 'Describe the image...' : webSearchMode ? 'Search the web...' : researchMode ? 'What should I research?' : 'Drop an idea...'}
            rows={2}
            disabled={disabled}
            className="w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3 pb-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: + button */}
            <div ref={toolsRef} className="relative">
              <button
                type="button"
                onClick={() => setShowTools(!showTools)}
                className={`rounded-full p-1.5 transition-colors ${showTools ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Tools dropdown */}
              {showTools && (
                <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl z-50">
                  <button
                    type="button"
                    onClick={() => { onResearchToggle?.(); setShowTools(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${researchMode ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    <Search className="h-4 w-4" />
                    Research
                    {researchMode && <span className="ml-auto text-brand-500">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onWebSearchToggle?.(); setShowTools(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${webSearchMode ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    <Globe className="h-4 w-4" />
                    Web search
                    {webSearchMode && <span className="ml-auto text-brand-500">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onImageModeToggle?.(); setShowTools(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${imageMode ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    <ImageIcon className="h-4 w-4" />
                    Generate image
                    {imageMode && <span className="ml-auto text-brand-500">✓</span>}
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
                disabled={disabled || !input.trim()}
                className={`rounded-xl p-2 transition-all ${
                  input.trim()
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-100 text-gray-300'
                } disabled:opacity-30`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-gray-300">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
