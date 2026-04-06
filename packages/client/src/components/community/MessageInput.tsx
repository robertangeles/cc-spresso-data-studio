import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';

interface MessageInputProps {
  channelName: string;
  onSend: (content: string) => Promise<void>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  disabled?: boolean;
}

const MAX_LENGTH = 4000;
const WARN_LENGTH = 3500;

export function MessageInput({
  channelName,
  onSend,
  onTypingStart,
  onTypingStop,
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart?.();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTypingStop?.();
    }, 2000);
  }, [onTypingStart, onTypingStop]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        onTypingStop?.();
      }
    };
  }, [onTypingStop]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setContent('');
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingStop?.();
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [content, sending, disabled, onSend, onTypingStop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const charCount = content.length;
  const showCounter = charCount >= WARN_LENGTH;
  const isOverLimit = charCount > MAX_LENGTH;
  const isSendDisabled = !content.trim() || sending || disabled || isOverLimit;

  return (
    <div className="px-4 pb-4">
      <div className="relative rounded-xl bg-surface-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus-within:shadow-[0_0_16px_rgba(255,214,10,0.08),inset_0_2px_4px_rgba(0,0,0,0.3)] transition-all duration-300">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}`}
          disabled={sending || disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{ maxHeight: '160px' }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={isSendDisabled}
          className="absolute right-2 bottom-2 p-2 rounded-lg bg-gradient-to-r from-accent to-amber-600 text-surface-0 disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_14px_rgba(255,214,10,0.25)] transition-all duration-200 ease-spring hover:scale-105 active:scale-95"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>

        {/* Character counter */}
        {showCounter && (
          <div
            className={`absolute right-14 bottom-3 text-xs font-medium ${
              isOverLimit
                ? 'text-red-400'
                : charCount >= MAX_LENGTH * 0.95
                  ? 'text-amber-400'
                  : 'text-emerald-400/70'
            }`}
          >
            {charCount}/{MAX_LENGTH}
          </div>
        )}
      </div>
    </div>
  );
}
