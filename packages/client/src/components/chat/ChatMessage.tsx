import Markdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { Message } from '../../hooks/useChat';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isImage = message.contentType === 'image_url' || message.contentType === 'image_base64';
  const isError = message.content.startsWith('Error:');

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-slide-up`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        {/* Role label */}
        <p className={`text-[10px] font-medium mb-1 ${isUser ? 'text-right' : ''} text-text-tertiary`}>
          {isUser ? 'You' : message.model ?? 'Assistant'}
        </p>

        {/* Message bubble */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-accent text-text-inverse shadow-[0_2px_8px_rgba(255,214,10,0.15)]'
            : isError
              ? 'bg-status-error-dim border border-status-error/30 text-status-error'
              : 'bg-surface-2 border border-border-subtle text-text-primary'
        }`}>
          {isImage ? (
            <div>
              <img src={message.content} alt="Generated" className="max-h-96 rounded-lg" />
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = message.content;
                  link.download = `spresso-image-${Date.now()}.jpg`;
                  link.click();
                }}
                className="mt-2 inline-block text-xs text-accent hover:text-accent-hover transition-colors"
              >
                Download Image
              </button>
            </div>
          ) : isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:bg-surface-3 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-text-primary prose-code:before:content-none prose-code:after:content-none prose-pre:bg-surface-3 prose-pre:border prose-pre:border-border-subtle prose-strong:text-text-primary prose-li:text-text-secondary">
              <Markdown>{message.content}</Markdown>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isUser && !isError && (
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {message.tokens > 0 && (
              <span className="text-[10px] text-text-tertiary">{message.tokens} tokens</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
