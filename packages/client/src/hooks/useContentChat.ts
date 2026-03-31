import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export function useContentChat(systemPrompt?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');

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
    async (text: string): Promise<string | null> => {
      if (!text.trim() || isSending) return null;

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
          systemPrompt: systemPrompt || undefined,
          metadata: { source: 'content-builder' },
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
    [isSending, ensureConversation, model],
  );

  const executeCommand = useCallback(
    async (
      instruction: string,
      currentContent: string,
      systemPromptOverride?: string | null,
    ): Promise<string> => {
      setIsSending(true);
      try {
        const convId = await ensureConversation();

        // Build the command message: include current content as context
        const contextPrefix = currentContent.trim()
          ? `The user has written the following content:\n---\n${currentContent}\n---\n\nInstruction: ${instruction}`
          : instruction;

        const { data } = await api.post(`/chat/conversations/${convId}/messages`, {
          content: contextPrefix,
          model,
          systemPrompt: systemPromptOverride ?? systemPrompt ?? undefined,
          metadata: { source: 'content-builder-command' },
        });

        const msg = data.data.message ?? data.data;
        return msg.content as string;
      } finally {
        setIsSending(false);
      }
    },
    [ensureConversation, model, systemPrompt],
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
    executeCommand,
    clearChat,
    conversationId,
  };
}
