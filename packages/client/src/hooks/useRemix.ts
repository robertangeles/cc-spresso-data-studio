import { useState, useCallback, useRef } from 'react';
import type { ContentItem } from './useContent';

export interface RemixConfig {
  sourceContentIds: string[];
  targetChannelIds: string[];
  style: string;
  customPrompt?: string;
  model?: string;
}

export interface RemixProgress {
  channelId: string;
  channelName: string;
  item: ContentItem;
}

export function useRemix() {
  const [isRemixing, setIsRemixing] = useState(false);
  const [progress, setProgress] = useState<RemixProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const remix = useCallback(
    async (config: RemixConfig, onComplete?: (items: RemixProgress[]) => void) => {
      setIsRemixing(true);
      setProgress([]);
      setError(null);
      const accumulated: RemixProgress[] = [];

      abortRef.current = new AbortController();

      try {
        // Get auth token from localStorage
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${baseUrl}/content/remix`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(config),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ message: 'Remix failed' }));
          throw new Error(err.message || `HTTP ${response.status}`);
        }

        // Read SSE stream
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
                const p: RemixProgress = {
                  channelId: event.channelId,
                  channelName: event.channelName,
                  item: event.item as ContentItem,
                };
                accumulated.push(p);
                setProgress([...accumulated]);
              } else if (event.type === 'error') {
                // Per-channel error — don't stop the whole remix
                console.warn(`Remix failed for ${event.channelName}: ${event.error}`);
              } else if (event.type === 'complete') {
                // Done
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }

        onComplete?.(accumulated);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const msg = err instanceof Error ? err.message : 'Remix failed';
          setError(msg);
        }
      } finally {
        setIsRemixing(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRemixing(false);
  }, []);

  return { remix, cancel, isRemixing, progress, error };
}
