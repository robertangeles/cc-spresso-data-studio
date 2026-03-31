import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Wand2, PenTool, Check } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { useThinkingMessage } from '../../lib/thinking-messages';
import { PromptBadge } from './PromptBadge';
import type { Prompt } from '../../hooks/usePrompts';
import type { ChatMessage } from '../../hooks/useContentChat';

interface CopilotChatProps {
  // Messages
  messages: ChatMessage[];
  isSending: boolean;

  // Send
  onSendMessage: (text: string) => void;
  isProcessing: boolean;

  // Prompt
  activePromptId: string | null;
  activePromptName: string | null;
  isSendingPrompt?: boolean;
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

  // Model
  model: string;
  onModelChange: (model: string) => void;

  // Actions on messages
  onApplyToEditor: (content: string) => void;
}

export function CopilotChat({
  messages,
  isSending,
  onSendMessage,
  isProcessing,
  activePromptId,
  activePromptName,
  isSendingPrompt,
  onSelectPrompt,
  onClearPrompt,
  onCreateNewPrompt,
  prompts,
  promptsLoading,
  onDeletePrompt,
  onEditPrompt,
  model,
  onModelChange,
  onApplyToEditor,
}: CopilotChatProps) {
  const { models: configuredModels } = useConfiguredModels();
  const [input, setInput] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thinkingMessage = useThinkingMessage(isSending);

  const busy = isSending || isProcessing;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() || busy) return;
    onSendMessage(input.trim());
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [input, busy, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = useCallback(
    (msgId: string, content: string) => {
      onApplyToEditor(content);
      setAppliedId(msgId);
      setTimeout(() => setAppliedId(null), 1500);
    },
    [onApplyToEditor],
  );

  const hasContent = input.trim().length > 0;
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ─── Messages area ─── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
        {!hasMessages && !isSending ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-3">
              <Wand2 className="h-5 w-5 text-accent" />
            </div>
            <p className="text-sm font-medium text-text-secondary mb-1">AI Co-pilot</p>
            <p className="text-xs text-text-tertiary max-w-[200px]">
              Select a prompt or type below to start creating content.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const justApplied = appliedId === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[90%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                    <div
                      className={`rounded-xl p-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-accent-dim text-text-primary'
                          : 'bg-surface-2 text-text-primary border border-border-subtle'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent mr-2 align-middle" />
                      )}
                      <span className="whitespace-pre-wrap inline">{msg.content}</span>
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApply(msg.id, msg.content)}
                          className={`inline-flex items-center gap-1 rounded-full text-[10px] px-2.5 py-0.5 font-medium transition-all duration-300 ${
                            justApplied
                              ? 'bg-status-success/20 text-status-success'
                              : 'bg-accent/15 text-accent hover:bg-accent/25'
                          }`}
                        >
                          {justApplied ? (
                            <>
                              <Check className="h-2.5 w-2.5" />
                              Applied
                            </>
                          ) : (
                            <>
                              <PenTool className="h-2.5 w-2.5" />
                              Apply to editor
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
                <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-sm text-text-tertiary italic">{thinkingMessage}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ─── Input area (sticky bottom) ─── */}
      <div className="shrink-0 border-t border-border-subtle px-3 py-2.5 bg-surface-1/50 backdrop-blur-sm">
        {/* Toolbar row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PromptBadge
              activePromptId={activePromptId}
              activePromptName={activePromptName}
              isSending={isSendingPrompt}
              onSelectPrompt={onSelectPrompt}
              onClearPrompt={onClearPrompt}
              onCreateNew={onCreateNewPrompt}
              prompts={prompts}
              loading={promptsLoading}
              onDeletePrompt={onDeletePrompt}
              onEditPrompt={onEditPrompt}
            />
            <span className="text-accent">
              <Wand2 className="h-3.5 w-3.5" />
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
          </div>
        </div>

        {/* Input row */}
        <div className="flex items-end gap-2">
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
            rows={1}
            disabled={busy}
            className="flex-1 resize-none bg-surface-2 rounded-lg border border-border-subtle text-sm text-text-primary placeholder:text-text-tertiary px-3 py-2 focus:outline-none focus:border-accent/40 disabled:opacity-50 min-h-[36px] max-h-[160px] leading-relaxed transition-colors"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!hasContent || busy}
            className={`shrink-0 rounded-lg p-2 transition-all ${
              busy
                ? 'bg-accent/50 text-text-inverse'
                : hasContent
                  ? 'bg-accent text-text-inverse hover:bg-accent-hover shadow-[0_0_10px_rgba(255,214,10,0.2)]'
                  : 'bg-surface-2 text-text-tertiary'
            } disabled:opacity-30`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-text-tertiary/50 text-right mt-1">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
