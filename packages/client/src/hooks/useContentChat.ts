import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentType?: string;
  createdAt: string;
}

interface SendOptions {
  /** What to display in the chat thread (defaults to the full text sent to API) */
  displayContent?: string;
  /** Override the system prompt for this message only */
  systemPromptOverride?: string | null;
  /** Cloudinary URLs of attached images */
  imageUrls?: string[];
}

export function useContentChat(systemPrompt?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [model, setModel] = useState('anthropic/claude-sonnet-4-6');

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;

    const { data } = await api.post('/chat/conversations', {
      title: '[CB] Content Builder Chat',
      metadata: { source: 'content-builder' },
    });
    const newId = data.data.id as string;
    setConversationId(newId);
    return newId;
  }, [conversationId]);

  const sendMessage = useCallback(
    async (text: string, options?: SendOptions): Promise<string | null> => {
      const hasImages = options?.imageUrls && options.imageUrls.length > 0;
      if ((!text.trim() && !hasImages) || isSending) return null;

      setIsSending(true);

      // Show displayContent in the thread if provided, otherwise show the full text
      const threadContent = options?.displayContent ?? text.trim();

      // Optimistically add user message (with display-friendly content)
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: hasImages
          ? JSON.stringify({ text: threadContent, images: options!.imageUrls })
          : threadContent,
        contentType: hasImages ? 'multimodal' : 'text',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const convId = await ensureConversation();

        const { data } = await api.post(`/chat/conversations/${convId}/messages`, {
          content: text.trim(),
          model,
          systemPrompt: options?.systemPromptOverride ?? systemPrompt ?? undefined,
          metadata: { source: 'content-builder' },
          ...(hasImages && { imageUrls: options.imageUrls }),
        });

        // Server returns { message: { id, content, ... }, usage: { ... } }
        const msg = data.data.message ?? data.data;
        const assistantMsg: ChatMessage = {
          id: msg.id,
          role: 'assistant',
          content: msg.content,
          createdAt: msg.createdAt ?? msg.created_at ?? new Date().toISOString(),
        };

        // Replace temp user message with server version and add assistant reply
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
          return [
            ...withoutTemp,
            {
              ...tempUserMsg,
              id: msg.userMessageId || tempUserMsg.id,
            },
            assistantMsg,
          ];
        });

        return assistantMsg.content;
      } catch {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return null;
      } finally {
        setIsSending(false);
      }
    },
    [isSending, ensureConversation, model, systemPrompt],
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
