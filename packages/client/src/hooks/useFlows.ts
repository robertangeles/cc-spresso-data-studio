import { useState, useEffect, useCallback } from 'react';
import type { Flow } from '@cc/shared';
import { api } from '../lib/api';

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlows = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/flows');
      setFlows(data.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const createFlow = async (name: string, description?: string) => {
    const { data } = await api.post('/flows', { name, description });
    setFlows((prev) => [data.data, ...prev]);
    return data.data as Flow;
  };

  const updateFlow = async (id: string, updates: Partial<Flow>) => {
    const { data } = await api.put(`/flows/${id}`, updates);
    setFlows((prev) => prev.map((f) => (f.id === id ? data.data : f)));
    return data.data as Flow;
  };

  const deleteFlow = async (id: string) => {
    await api.delete(`/flows/${id}`);
    setFlows((prev) => prev.filter((f) => f.id !== id));
  };

  return { flows, isLoading, fetchFlows, createFlow, updateFlow, deleteFlow };
}

export function useFlow(id: string) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFlow = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get(`/flows/${id}`);
        setFlow(data.data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFlow();
  }, [id]);

  const updateFlow = async (updates: Partial<Flow>) => {
    const { data } = await api.put(`/flows/${id}`, updates);
    setFlow(data.data);
    return data.data as Flow;
  };

  return { flow, isLoading, updateFlow };
}
