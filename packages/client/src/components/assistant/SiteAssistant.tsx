import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, Minus, Send, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Hi! I'm your Spresso guide. Ask me anything about the platform \u2014 features, workflows, or how to get the most out of your content.";

export function SiteAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsSending(true);

    try {
      // Send last 10 messages as history (excluding the new user message which is sent as `message`)
      const history = updated.slice(-11, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post('/assistant/chat', {
        message: trimmed,
        currentPage: location.pathname,
        history,
      });

      const reply = res.data?.data?.reply;
      if (reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        if (!isOpen) setHasUnread(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // FAB
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-amber-600 shadow-[0_0_20px_rgba(255,214,10,0.3)] transition-transform duration-200 hover:scale-110 hover:shadow-[0_0_30px_rgba(255,214,10,0.5)]"
        style={{ animation: 'fab-breathe 3s ease-in-out infinite' }}
        aria-label="Open site assistant"
      >
        <Sparkles className="h-6 w-6 text-white" />
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-0 bg-red-500" />
        )}
        <style>{`
          @keyframes fab-breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </button>
    );
  }

  // Chat drawer
  return (
    <div className="animate-scale-in fixed bottom-6 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-dark-lg">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-accent to-amber-600 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-white" />
          <span className="text-sm font-semibold text-white">Spresso Assistant</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Minimize assistant"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent/20 text-text-primary'
                  : 'bg-surface-2 text-text-secondary'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isSending}
            className="flex-1 rounded-lg border border-border-subtle bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={isSending || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-surface-0 transition-colors hover:bg-accent/90 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-text-muted">
          Powered by Spresso AI
        </p>
      </div>
    </div>
  );
}
