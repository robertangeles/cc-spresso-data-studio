import { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon } from 'lucide-react';
import { ModelSelector } from '../ui/ModelSelector';

interface ChatInputProps {
  onSend: (content: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  imageMode?: boolean;
  onImageModeToggle?: () => void;
}

export function ChatInput({ onSend, model, onModelChange, disabled, imageMode, onImageModeToggle }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="mx-auto max-w-3xl">
        {/* Model selector row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 max-w-xs">
            <ModelSelector value={model} onChange={onModelChange} allowAuto />
          </div>
          {onImageModeToggle && (
            <button
              type="button"
              onClick={onImageModeToggle}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                imageMode
                  ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={imageMode ? 'Image generation ON' : 'Enable image generation'}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {imageMode ? 'Image ON' : 'Image'}
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="relative flex items-end rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={imageMode ? 'Describe the image you want...' : 'Message Content Pilot...'}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none rounded-2xl bg-transparent px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            className="m-1.5 rounded-xl bg-brand-600 p-2 text-white transition-all hover:bg-brand-700 disabled:opacity-30 disabled:hover:bg-brand-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-gray-300">
          Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
