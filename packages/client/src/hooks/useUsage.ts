import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  avgDurationMs: number;
}

interface UsageByModel {
  modelId: string;
  displayName: string;
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  percentage: number;
}

interface UsageByFlow {
  flowId: string;
  flowName: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface UsageTimeseries {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface CostSuggestion {
  flowName: string;
  flowId: string;
  stepIndex: number;
  currentModel: string;
  currentCostPerM: number;
  suggestedModel: string;
  suggestedCostPerM: number;
  savingsPercent: number;
}

interface UseUsageReturn {
  summary: UsageSummary | null;
  byModel: UsageByModel[];
  byFlow: UsageByFlow[];
  timeseries: UsageTimeseries[];
  suggestions: CostSuggestion[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUsage(from?: string, to?: string): UseUsageReturn {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byModel, setByModel] = useState<UsageByModel[]>([]);
  const [byFlow, setByFlow] = useState<UsageByFlow[]>([]);
  const [timeseries, setTimeseries] = useState<UsageTimeseries[]>([]);
  const [suggestions, setSuggestions] = useState<CostSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryRes, modelRes, flowRes, tsRes, suggestRes] = await Promise.all([
        api.get(`/admin/usage/summary${qs}`),
        api.get(`/admin/usage/by-model${qs}`),
        api.get(`/admin/usage/by-flow${qs}`),
        api.get(`/admin/usage/timeseries${qs}`),
        api.get('/admin/usage/suggestions'),
      ]);

      setSummary(summaryRes.data.data);
      setByModel(modelRes.data.data);
      setByFlow(flowRes.data.data);
      setTimeseries(tsRes.data.data);
      setSuggestions(suggestRes.data.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load usage data';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    try {
      await api.post('/admin/usage/refresh');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh';
      setError(msg);
    }
  }, [fetchData]);

  return { summary, byModel, byFlow, timeseries, suggestions, isLoading, error, refresh };
}
