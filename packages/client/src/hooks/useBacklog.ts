import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { BacklogItem } from '@cc/shared';

export function useBacklogItems(filters: { status?: string; category?: string } = {}) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      const { data } = await api.get(`/backlog/items?${params}`);
      setItems(data.data ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.category]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const vote = async (itemId: string, voteType: 'up' | 'down') => {
    try {
      const { data } = await api.post(`/backlog/items/${itemId}/vote`, { voteType });
      setItems((prev) => prev.map((item) => (item.id === itemId ? data.data : item)));
    } catch {
      /* non-blocking */
    }
  };

  const removeVote = async (itemId: string) => {
    try {
      const { data } = await api.delete(`/backlog/items/${itemId}/vote`);
      setItems((prev) => prev.map((item) => (item.id === itemId ? data.data : item)));
    } catch {
      /* non-blocking */
    }
  };

  return { items, loading, refetch: fetchItems, vote, removeVote };
}
