import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import type { ScheduledPost } from '../utils/calendar';

export function useScheduledPosts(currentMonth: Date) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);

  // Compute date range for the month (with padding for grid overflow)
  const { startStr, endStr } = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    // Pad start to previous Sunday and end to next Saturday
    const startPad = new Date(first);
    startPad.setDate(startPad.getDate() - first.getDay());
    const endPad = new Date(last);
    endPad.setDate(endPad.getDate() + (6 - last.getDay()));
    return {
      startStr: startPad.toISOString().split('T')[0],
      endStr: endPad.toISOString().split('T')[0],
    };
  }, [currentMonth]);

  const fetchPosts = useCallback(() => {
    if (!startStr || !endStr) return;
    api
      .get(`/schedule/calendar?start=${startStr}&end=${endStr}`)
      .then(({ data }) => setPosts(data.data ?? []))
      .catch(() => {});
  }, [startStr, endStr]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchPosts();
    setLoading(false);
  }, [fetchPosts]);

  // Poll every 30s when there are pending posts (only when tab is visible)
  useEffect(() => {
    const hasPending = posts.some((p) => p.status === 'pending');
    if (!hasPending) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPosts();
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [posts, fetchPosts]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of posts) {
      const key = new Date(post.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await api.delete(`/schedule/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleRetry = useCallback(async (postId: string) => {
    try {
      await api.post(`/schedule/${postId}/retry`);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: 'pending' as const, error: null } : p)),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  return { posts, postsByDate, loading, fetchPosts, handleDelete, handleRetry };
}
