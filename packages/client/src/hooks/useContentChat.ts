import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export function useContentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;

    const { data } = await api.post('/chat/conversations', {
      title: 'Content Builder Chat',
      metadata: { source: 'content-builder' },
    });
    const newId = data.data.id as string;
    setConversationId(newId);
    return newId;
  }, [conversationId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return;

      setIsSending(true);

      // Optimistically add user message
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const convId = await ensureConversation();

        const { data } = await api.post(`/chat/conversations/${convId}/messages`, {
          content: text.trim(),
          model,
          metadata: { source: 'content-builder' },
        });

        const assistantMsg: ChatMessage = {
          id: data.data.id,
          role: 'assistant',
          content: data.data.content,
          createdAt: data.data.createdAt,
        };

        // Replace temp user message with server version and add assistant reply
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
          return [
            ...withoutTemp,
            {
              ...tempUserMsg,
              id: data.data.userMessageId || tempUserMsg.id,
            },
            assistantMsg,
          ];
        });
      } catch {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      } finally {
        setIsSending(false);
      }
    },
    [isSending, ensureConversation, model],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return {
    messages,
    isSending,
    model,
    setModel,
    sendMessage,
    clearChat,
    conversationId,
  };
}
