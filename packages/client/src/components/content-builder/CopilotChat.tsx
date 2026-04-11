import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Loader2, Wand2, PenTool, Check } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import { useThinkingMessage } from '../../lib/thinking-messages';
import { getRandomGreeting } from '../../lib/greetings';
import { useAuth } from '../../context/AuthContext';
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

// ─── Knight Rider border CSS ───
const knightRiderCSS = `
@keyframes knight-rider {
  0%   { background-position: -200% 0, 0 -200%, 200% 0, 0 200%; }
  25%  { background-position: 200% 0, 0 -200%, 200% 0, 0 200%; }
  50%  { background-position: 200% 0, 0 200%, 200% 0, 0 200%; }
  75%  { background-position: 200% 0, 0 200%, -200% 0, 0 200%; }
  100% { background-position: 200% 0, 0 200%, -200% 0, 0 -200%; }
}
.knight-rider-border {
  position: relative;
}
.knight-rider-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background:
    linear-gradient(90deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) top / 200% 1px no-repeat,
    linear-gradient(180deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) right / 1px 200% no-repeat,
    linear-gradient(270deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) bottom / 200% 1px no-repeat,
    linear-gradient(0deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) left / 1px 200% no-repeat;
  animation: knight-rider 4s linear infinite;
  pointer-events: none;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
`;

// ─── Neural Network Background Animation ───
interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulse: number;
}

function NeuralNetworkBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NeuralNode[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const nodeCount = 15;
    nodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 2 + Math.random() * 2,
      pulse: Math.random() * Math.PI * 2,
    }));

    const connectionDist = 140;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const nodes = nodesRef.current;
      const t = Date.now() * 0.001;

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.pulse += 0.02;
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.2;
            const pulseAlpha = Math.sin(t * 2 + i + j) * 0.5 + 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255, 214, 10, ${alpha * pulseAlpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      for (const node of nodes) {
        const glow = Math.sin(node.pulse) * 0.3 + 0.7;
        const r = node.radius * glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 10, ${0.03 * glow})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 10, ${0.35 * glow})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.5 }}
    />
  );
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
  const { user } = useAuth();
  const greeting = useMemo(() => getRandomGreeting(), []);
  const firstName = user?.name?.split(' ')[0] ?? '';

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
      <style>{knightRiderCSS}</style>
      {/* ─── Messages area ─── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
        {!hasMessages && !isSending ? (
          <div className="relative flex flex-col items-center justify-center h-full text-center px-4 overflow-hidden">
            <NeuralNetworkBg />
            <div className="relative z-10">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-3 mx-auto">
                <Wand2 className="h-5 w-5 text-accent" />
              </div>
              <p className="text-lg font-semibold text-text-primary mb-0.5">
                {greeting.text}
                {firstName ? `, ${firstName}` : ''}
              </p>
              <p className="text-[10px] text-text-tertiary mb-2">
                {greeting.language} — {greeting.country}
              </p>
              <p className="text-xs text-text-tertiary max-w-[200px]">
                Select a prompt or type below to start creating content.
              </p>
            </div>
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

      {/* ─── Input area (sticky bottom) — toolbar inside textarea container ─── */}
      <div className="shrink-0 border-t border-border-subtle px-3 py-2.5 bg-surface-1/50 backdrop-blur-sm">
        <div className="knight-rider-border rounded-lg border border-border-subtle bg-surface-2 focus-within:border-accent/40 transition-colors">
          {/* Textarea */}
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
            rows={3}
            disabled={busy}
            className="w-full resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary px-3 pt-2.5 pb-1 focus:outline-none disabled:opacity-50 min-h-[72px] max-h-[160px] leading-relaxed"
          />

          {/* Toolbar row inside the textarea container */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1.5">
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
                className="text-xs text-text-secondary font-medium pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-3 border border-border-subtle hover:border-border-default focus:border-accent/40 focus:outline-none cursor-pointer transition-colors"
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
                disabled={!hasContent || busy}
                className={`shrink-0 rounded-lg p-2 transition-all ${
                  busy
                    ? 'bg-accent/50 text-text-inverse'
                    : hasContent
                      ? 'bg-accent text-text-inverse hover:bg-accent-hover shadow-[0_0_10px_rgba(255,214,10,0.2)]'
                      : 'bg-surface-3/50 text-text-tertiary'
                } disabled:opacity-30`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-text-tertiary/50 text-right mt-1">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
