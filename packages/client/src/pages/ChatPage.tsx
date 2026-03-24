import { useRef, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { ChatEmptyState } from '../components/chat/ChatEmptyState';

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('id');

  const {
    messages,
    isSending,
    model,
    setModel,
    loadConversation,
    newChat,
    sendMessage,
  } = useChat();

  const [imageMode, setImageMode] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [webSearchMode, setWebSearchMode] = useState(false);
  const previousModelRef = useRef(model);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation from URL param
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      newChat();
    }
  }, [conversationId, loadConversation, newChat]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Switch model when research/web search mode toggles
  const handleResearchToggle = () => {
    if (!researchMode) {
      previousModelRef.current = model;
      setModel('perplexity/sonar-pro');
      setWebSearchMode(false);
    } else {
      setModel(previousModelRef.current);
    }
    setResearchMode(!researchMode);
  };

  const handleWebSearchToggle = () => {
    if (!webSearchMode) {
      previousModelRef.current = model;
      setModel('perplexity/sonar');
      setResearchMode(false);
    } else {
      setModel(previousModelRef.current);
    }
    setWebSearchMode(!webSearchMode);
  };

  const handleImageToggle = () => {
    if (!imageMode) {
      previousModelRef.current = model;
      setModel('google/gemini-3.1-flash-image-preview');
    } else {
      setModel(previousModelRef.current);
    }
    setImageMode(!imageMode);
  };

  const handleSend = (content: string) => {
    sendMessage(content);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatEmptyState onSuggestionClick={handleSend} />
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isSending && (
              <div className="flex justify-start mb-4">
                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: '0ms' }} />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: '150ms' }} />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        model={model}
        onModelChange={setModel}
        disabled={isSending}
        imageMode={imageMode}
        onImageModeToggle={handleImageToggle}
        researchMode={researchMode}
        onResearchToggle={handleResearchToggle}
        webSearchMode={webSearchMode}
        onWebSearchToggle={handleWebSearchToggle}
      />
    </div>
  );
}
