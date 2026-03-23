import { useState, useEffect, useCallback } from 'react';
import type { DatabaseStatus, TableInfo, QueryResult } from '@cc/shared';
import { api } from '../lib/api';

export function useDatabaseStatus() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/admin/database/status');
      setStatus(data.data);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, isLoading, refresh };
}

export function useTableInfo() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/admin/database/tables');
      setTables(data.data);
    } catch {
      setTables([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tables, isLoading, refresh };
}

export function useQueryTool() {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeQuery = useCallback(async (sql: string, mode: 'read' | 'write') => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post('/admin/database/query', { sql, mode });
      setResult(data.data);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Query failed');
      } else {
        setError('Query failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, executeQuery, clear };
}
