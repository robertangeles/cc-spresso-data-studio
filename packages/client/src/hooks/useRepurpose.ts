import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type { ContentItem } from './useContent';

export interface RepurposeConfig {
  sourceText: string;
  sourceUrl?: string;
  targetChannelIds: string[];
  style: string;
  customPrompt?: string;
  model?: string;
}

export interface RepurposeProgress {
  channelId: string;
  channelName: string;
  item: ContentItem;
}

export function useRepurpose() {
  const [isRepurposing, setIsRepurposing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState<RepurposeProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrapeUrl = useCallback(
    async (url: string): Promise<{ title: string; body: string; source: string }> => {
      setIsScraping(true);
      setError(null);
      try {
        const { data } = await api.post('/content/scrape-url', { url });
        return data.data;
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err instanceof Error ? err.message : 'Failed to scrape URL');
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsScraping(false);
      }
    },
    [],
  );

  const repurpose = useCallback(
    async (config: RepurposeConfig, onComplete?: (items: RepurposeProgress[]) => void) => {
      setIsRepurposing(true);
      setProgress([]);
      setError(null);
      const accumulated: RepurposeProgress[] = [];

      abortRef.current = new AbortController();

      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${baseUrl}/content/repurpose`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(config),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ message: 'Repurpose failed' }));
          throw new Error(err.message || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (done) break;
          const value = result.value;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const event = JSON.parse(json);
              if (event.type === 'progress' && event.item) {
                const p: RepurposeProgress = {
                  channelId: event.channelId,
                  channelName: event.channelName,
                  item: event.item as ContentItem,
                };
                accumulated.push(p);
                setProgress([...accumulated]);
              }
            } catch {
              // Skip unparseable
            }
          }
        }

        onComplete?.(accumulated);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Repurpose failed');
        }
      } finally {
        setIsRepurposing(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRepurposing(false);
  }, []);

  return { scrapeUrl, repurpose, cancel, isScraping, isRepurposing, progress, error };
}
