import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: string;
  model: string | null;
  tokens: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [model, setModel] = useState('anthropic/claude-sonnet-4-6');

  // Load conversations list
  const refreshConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setConversations(data.data ?? []);
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load a specific conversation with messages
  const loadConversation = useCallback(async (conversationId: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/chat/conversations/${conversationId}`);
      const conv = data.data;
      setActiveConversation(conv);
      setMessages(conv.messages ?? []);
      setModel(conv.model);
    } catch {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new conversation
  const newChat = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      let conversationId = activeConversation?.id;

      // Auto-create conversation if none exists
      if (!conversationId) {
        try {
          const { data } = await api.post('/chat/conversations', { model });
          conversationId = data.data.id;
          setActiveConversation(data.data);
        } catch {
          return;
        }
      }

      // Optimistically add user message
      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: conversationId!,
        role: 'user',
        content,
        contentType: 'text',
        model: null,
        tokens: 0,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      try {
        const { data } = await api.post(`/chat/conversations/${conversationId}/messages`, {
          content,
          model,
        });

        const assistantMsg = data.data.message as Message;

        // Replace temp user msg and add assistant response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== userMsg.id),
          { ...userMsg, id: `user-${Date.now()}` },
          assistantMsg,
        ]);

        // Refresh conversations list (title may have been generated)
        setTimeout(() => refreshConversations(), 2000);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to send message';
        // Add error as assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            conversationId: conversationId!,
            role: 'assistant',
            content: `Error: ${msg}`,
            contentType: 'text',
            model: null,
            tokens: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [activeConversation, model, refreshConversations],
  );

  // Delete a conversation
  const deleteConversation = useCallback(
    async (id: string) => {
      await api.delete(`/chat/conversations/${id}`);
      if (activeConversation?.id === id) {
        newChat();
      }
      await refreshConversations();
    },
    [activeConversation, newChat, refreshConversations],
  );

  return {
    conversations,
    activeConversation,
    messages,
    isLoading,
    isSending,
    model,
    setModel,
    refreshConversations,
    loadConversation,
    newChat,
    sendMessage,
    deleteConversation,
  };
}
