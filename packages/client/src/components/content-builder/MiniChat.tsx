import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ArrowUp, Check, ChevronDown, ChevronUp, Loader2, Wand2 } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';

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
  const [collapsed, setCollapsed] = useState(false);
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 64)}px`;
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

  const hasContent = input.trim().length > 0;

  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle overflow-hidden">
      {/* Gradient accent line at the top — thicker for more presence */}
      <div className="h-[3px] bg-gradient-to-r from-accent via-amber-500 to-accent/40" />

      {/* Header — subtle gradient background */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2.5 bg-gradient-to-r from-accent/[0.04] to-transparent hover:from-accent/[0.08] transition-all"
      >
        <div className="flex items-center gap-2">
          {/* Animated sparkle/wand icon */}
          <span className="relative">
            <Wand2 className="h-4 w-4 text-accent" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent animate-ping opacity-75" />
          </span>
          <span className="text-sm font-medium text-text-primary">AI Assistant</span>
          {/* Pulsing message count badge when collapsed */}
          {collapsed && messages.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-accent-dim text-accent text-[10px] font-medium min-w-[18px] h-[18px] px-1 animate-pulse">
              {messages.length}
            </span>
          )}
          {/* Subtle dot when expanded with messages */}
          {!collapsed && messages.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
          )}
        </div>
        {/* Glass morphism chevron circle */}
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 backdrop-blur-sm border border-white/10">
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5 text-text-tertiary" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
          )}
        </span>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {/* Active prompt banner */}
          {activePromptName && (
            <div className="flex items-center justify-between px-4 py-2 bg-accent/10 border-b border-accent/20">
              <span className="text-xs text-accent font-medium">
                <Wand2 className="inline h-3 w-3 mr-1" />
                Using prompt: {activePromptName}
              </span>
              {onClearPrompt && (
                <button
                  type="button"
                  onClick={onClearPrompt}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Message list with subtle radial gradient */}
          <div
            className="max-h-[300px] overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)',
            }}
          >
            {messages.length === 0 && (
              <p className="text-xs text-text-tertiary text-center py-6 italic">
                Ask me to write, refine, or brainstorm your content
              </p>
            )}
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
                      {/* Amber status dot for assistant messages */}
                      {msg.role === 'assistant' && (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent mr-2 align-middle" />
                      )}
                      <p className="whitespace-pre-wrap inline">{msg.content}</p>
                    </div>
                    {/* Insert button for assistant messages — pill shape */}
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
              <div className="flex justify-start">
                <div className="bg-surface-2 rounded-lg p-3">
                  <Loader2 className="h-4 w-4 text-text-tertiary animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area — glass morphism */}
          <div className="px-3 pb-3">
            <div className="flex items-end gap-2 bg-surface-2/50 backdrop-blur-sm rounded-lg border border-white/5 p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the AI..."
                rows={1}
                disabled={isSending}
                className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 min-h-[28px]"
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
        </>
      )}
    </div>
  );
}
