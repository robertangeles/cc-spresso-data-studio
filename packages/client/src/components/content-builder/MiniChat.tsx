import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ArrowUp, Check, Wand2, X } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { useThinkingMessage } from '../../lib/thinking-messages';

interface MiniChatProps {
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>;
  onSendMessage: (text: string) => void;
  onInsert: (text: string) => void;
  isSending: boolean;
  model: string;
  onModelChange: (model: string) => void;
  activePromptName?: string | null;
  onClearPrompt?: () => void;
}

export function MiniChat({
  messages,
  onSendMessage,
  onInsert,
  isSending,
  model,
  onModelChange,
  activePromptName,
  onClearPrompt,
}: MiniChatProps) {
  const { models: configuredModels } = useConfiguredModels();
  const [input, setInput] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsert = useCallback(
    (msgId: string, text: string) => {
      setInsertedId(msgId);
      onInsert(text);
      setTimeout(() => setInsertedId(null), 1200);
    },
    [onInsert],
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const thinkingMessage = useThinkingMessage(isSending);
  const hasContent = input.trim().length > 0;
  const hasMessages = messages.length > 0;

  return (
    <div className="px-3 py-2.5">
      {/* Messages area — only visible when messages exist */}
      {hasMessages && (
        <div
          className="max-h-[250px] overflow-y-auto mb-2.5 space-y-2 scrollbar-thin"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)',
          }}
        >
          {messages.map((msg) => {
            const justInserted = insertedId === msg.id;
            return (
              <div
                key={msg.id}
                className={`flex animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                  <div
                    className={`rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-accent-dim text-text-primary'
                        : 'bg-surface-2 text-text-primary'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent mr-2 align-middle" />
                    )}
                    <p className="whitespace-pre-wrap inline">{msg.content}</p>
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => handleInsert(msg.id, msg.content)}
                        className={`inline-flex items-center gap-1 rounded-full text-xs px-3 py-1 font-medium transition-all duration-300 ${
                          justInserted
                            ? 'bg-status-success/20 text-status-success'
                            : 'bg-accent/20 text-accent hover:bg-accent/30'
                        }`}
                      >
                        {justInserted ? (
                          <>
                            <Check className="h-3 w-3" />
                            Inserted
                          </>
                        ) : (
                          <>
                            <ArrowUp className="h-3 w-3" />
                            Insert
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isSending && (
            <div className="flex justify-start animate-slide-up">
              <div className="bg-surface-2 rounded-lg p-3 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-sm text-text-tertiary italic">{thinkingMessage}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar — visible and inviting */}
      <div className="flex items-start gap-2 bg-surface-1 backdrop-blur-sm rounded-xl border border-accent/20 px-4 py-3 shadow-[0_0_10px_rgba(255,214,10,0.05)] hover:border-accent/30 hover:shadow-[0_0_15px_rgba(255,214,10,0.08)] transition-all">
        {/* AI label */}
        <span className="shrink-0 flex items-center gap-1.5 text-accent mr-1">
          <Wand2 className="h-4 w-4" />
          <span className="text-xs font-semibold hidden sm:inline">AI</span>
        </span>
        {/* Prompt chip inside the input area */}
        {activePromptName && (
          <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium text-accent bg-accent/10 rounded-full px-2 py-0.5">
            <Wand2 className="h-2.5 w-2.5" />
            {activePromptName}
            {onClearPrompt && (
              <button
                type="button"
                onClick={onClearPrompt}
                className="ml-0.5 hover:text-text-secondary transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI to write, refine, or brainstorm..."
          rows={3}
          disabled={isSending}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 min-h-[120px]"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="text-[10px] text-text-tertiary font-medium px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle hover:border-border-default focus:border-accent/40 focus:outline-none cursor-pointer appearance-none pr-4 transition-colors"
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
          <button
            type="button"
            onClick={handleSend}
            disabled={!hasContent || isSending}
            className={`rounded-lg p-1.5 transition-all ${
              hasContent
                ? 'bg-accent text-text-inverse hover:bg-accent-hover'
                : 'bg-surface-2 text-text-tertiary'
            } disabled:opacity-30`}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
