import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface ContentItem {
  id: string;
  title: string;
  body: string;
  contentType: string;
  status: string;
  channelId: string | null;
  flowId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Channel {
  id: string;
  name: string;
  slug: string;
  type: string;
  icon: string;
}

interface UseContentOptions {
  channelId?: string;
  status?: string;
  search?: string;
}

export function useContent(options: UseContentOptions = {}) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (options.channelId) params.set('channelId', options.channelId);
      if (options.status) params.set('status', options.status);
      if (options.search) params.set('search', options.search);
      const { data } = await api.get(`/content?${params.toString()}`);
      setItems(data.data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [options.channelId, options.status, options.search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateItem = useCallback(async (id: string, updates: Partial<ContentItem>) => {
    const { data } = await api.put(`/content/${id}`, updates);
    setItems((prev) => prev.map((item) => (item.id === id ? data.data : item)));
    return data.data;
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await api.delete(`/content/${id}`);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { items, isLoading, refresh, updateItem, deleteItem };
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    api.get('/content/channels')
      .then(({ data }) => setChannels(data.data))
      .catch(() => setChannels([]));
  }, []);

  return channels;
}
