import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface Prompt {
  id: string;
  name: string;
  body: string;
  description: string | null;
  defaultModel: string | null;
  category: string | null;
  version: number;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface CreatePromptData {
  name: string;
  body: string;
  category?: string;
}

interface UpdatePromptData {
  name?: string;
  body?: string;
  category?: string;
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      const res = await api.get(`/prompts?${params.toString()}`);
      console.log('[usePrompts] API response:', res.data);
      const list = res.data?.data ?? [];
      console.log('[usePrompts] Setting prompts:', list.length);
      setPrompts(list);
    } catch (err) {
      console.error('[usePrompts] Failed to fetch prompts:', err);
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const createPrompt = useCallback(async (promptData: CreatePromptData) => {
    const { data } = await api.post('/prompts', promptData);
    setPrompts((prev) => [data.data, ...prev]);
    return data.data as Prompt;
  }, []);

  const updatePrompt = useCallback(async (id: string, updates: UpdatePromptData) => {
    const { data } = await api.put(`/prompts/${id}`, updates);
    setPrompts((prev) => prev.map((p) => (p.id === id ? data.data : p)));
    return data.data as Prompt;
  }, []);

  const deletePrompt = useCallback(async (id: string) => {
    await api.delete(`/prompts/${id}`);
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const revertPrompt = useCallback(async (id: string, version: number) => {
    const { data } = await api.post(`/prompts/${id}/revert/${version}`);
    setPrompts((prev) => prev.map((p) => (p.id === id ? data.data : p)));
    return data.data as Prompt;
  }, []);

  return {
    prompts,
    loading,
    category,
    setCategory,
    createPrompt,
    updatePrompt,
    deletePrompt,
    revertPrompt,
    refetch: fetchPrompts,
  };
}
