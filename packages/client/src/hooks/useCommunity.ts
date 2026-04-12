import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { CommunityChannel, CommunityMessage } from '@cc/shared';

export function useChannels() {
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const { data } = await api.get('/community/channels');
      setChannels(data.data ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return { channels, loading, refetch: fetchChannels };
}

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!channelId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        params.set('limit', '50');
        const { data } = await api.get(`/community/channels/${channelId}/messages?${params}`);
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
    [channelId],
  );

  useEffect(() => {
    if (channelId) {
      setMessages([]);
      setHasMore(true);
      fetchMessages();
    }
  }, [channelId, fetchMessages]);

  const addMessage = useCallback((msg: CommunityMessage) => {
    setMessages((prev) => [msg, ...prev]);
  }, []);

  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore && !loading) {
      fetchMessages(messages[messages.length - 1]?.id);
    }
  }, [messages, hasMore, loading, fetchMessages]);

  return { messages, loading, hasMore, addMessage, loadMore, setMessages };
}

export function useUnreadCounts() {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const fetchUnreads = useCallback(async () => {
    try {
      const { data } = await api.get('/community/unread');
      const counts: Record<string, number> = {};
      for (const item of data.data ?? []) {
        counts[item.channelId] = item.unreadCount;
      }
      setUnreadCounts(counts);
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    fetchUnreads();
  }, [fetchUnreads]);

  return { unreadCounts, refetch: fetchUnreads };
}

export function useChannelMembers(channelId: string | null) {
  const [members, setMembers] = useState<Array<{ userId: string; name: string; email: string }>>(
    [],
  );

  useEffect(() => {
    if (!channelId) return;
    api
      .get(`/community/channels/${channelId}/members`)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => {});
  }, [channelId]);

  return members;
}

export async function sendChannelMessage(
  channelId: string,
  content: string,
  attachments?: Array<{ type: string; url: string }>,
) {
  const { data } = await api.post(`/community/channels/${channelId}/messages`, {
    content,
    attachments,
  });
  return data.data;
}

export async function joinChannel(channelId: string) {
  await api.post(`/community/channels/${channelId}/join`);
}

export async function markChannelRead(channelId: string) {
  await api.put(`/community/channels/${channelId}/read`);
}

export async function markDmRead(conversationId: string) {
  await api.put(`/dm/conversations/${conversationId}/read`);
}
