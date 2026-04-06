import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { DirectConversation, DirectMessage } from '@cc/shared';

export function useDMConversations() {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/dm/conversations');
      setConversations(data.data ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}

export function useDMMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!conversationId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        params.set('limit', '50');
        const { data } = await api.get(`/dm/conversations/${conversationId}/messages?${params}`);
        const fetched = data.data ?? [];
        if (before) {
          setMessages((prev) => [...prev, ...fetched]);
        } else {
          setMessages(fetched);
        }
        setHasMore(fetched.length >= 50);
      } catch {
        /* non-blocking */
      } finally {
        setLoading(false);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    if (conversationId) {
      setMessages([]);
      setHasMore(true);
      fetchMessages();
    }
  }, [conversationId, fetchMessages]);

  const addMessage = useCallback((msg: DirectMessage) => {
    setMessages((prev) => [msg, ...prev]);
  }, []);

  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore && !loading) {
      fetchMessages(messages[messages.length - 1]?.id);
    }
  }, [messages, hasMore, loading, fetchMessages]);

  return { messages, loading, hasMore, addMessage, loadMore, setMessages };
}

export async function createDMConversation(userId: string) {
  const { data } = await api.post('/dm/conversations', { userId });
  return data.data;
}

export async function sendDMMessage(conversationId: string, content: string) {
  const { data } = await api.post(`/dm/conversations/${conversationId}/messages`, { content });
  return data.data;
}

export function useBlocks() {
  const [blocks, setBlocks] = useState<Array<{ blockedId: string; blockedName: string }>>([]);

  const fetchBlocks = useCallback(async () => {
    try {
      const { data } = await api.get('/dm/blocks');
      setBlocks(data.data ?? []);
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const blockUser = async (userId: string) => {
    await api.post('/dm/blocks', { userId });
    fetchBlocks();
  };

  const unblockUser = async (userId: string) => {
    await api.delete(`/dm/blocks/${userId}`);
    fetchBlocks();
  };

  return { blocks, blockUser, unblockUser, refetch: fetchBlocks };
}
