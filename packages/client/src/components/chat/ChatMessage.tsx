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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-in`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        {/* Role label */}
        <p className={`text-[10px] font-medium mb-1 ${isUser ? 'text-right text-gray-400' : 'text-gray-400'}`}>
          {isUser ? 'You' : message.model ?? 'Assistant'}
        </p>

        {/* Message bubble */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-brand-600 text-white'
            : isError
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-white border border-gray-200 text-gray-800'
        }`}>
          {isImage ? (
            <div>
              <img src={message.content} alt="Generated" className="max-h-96 rounded-lg" />
              <a href={message.content} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-brand-600 hover:text-brand-800">
                Open full size
              </a>
            </div>
          ) : isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-gray max-w-none">
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
              className="text-gray-300 hover:text-gray-500 transition-colors"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {message.tokens > 0 && (
              <span className="text-[10px] text-gray-300">{message.tokens} tokens</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
