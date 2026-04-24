import { useCallback, useState } from 'react';
import type { Layer, ProjectEntityResponse } from '@cc/shared';
import { api } from '../lib/api';
import { errorMessage, isStatus } from '../lib/api-errors';
import { useToast } from '../components/ui/Toast';

/**
 * Step 7 — auto-project (EXP-1) hook.
 *
 * One mutation: `project(entityId, toLayer, nameOverride?)`. Server
 * scaffolds the new entity + layer_link + attribute_links in one tx
 * and returns all three. 409 = already projected to that layer (UI
 * can offer "Jump to it" — the server message says as much).
 */

interface ProjectResponse {
  data: ProjectEntityResponse;
}

export interface UseProjectionApi {
  isMutating: boolean;
  error: string | null;
  /** Scaffold a projection of `sourceEntityId` on `toLayer`. Returns
   *  the new entity + layer_link + attribute_links. Throws on failure;
   *  a 409 carries the server message "Already projected on {layer}". */
  project(
    sourceEntityId: string,
    toLayer: Layer,
    nameOverride?: string,
  ): Promise<ProjectEntityResponse>;
  /** Convenience predicate for callers that want to show a "Jump to it?"
   *  CTA only when 409 fired. */
  isAlreadyProjectedError(err: unknown): boolean;
}

export function useProjection(modelId: string | undefined): UseProjectionApi {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const project = useCallback(
    async (
      sourceEntityId: string,
      toLayer: Layer,
      nameOverride?: string,
    ): Promise<ProjectEntityResponse> => {
      if (!modelId) throw new Error('No model selected');
      setIsMutating(true);
      setError(null);
      try {
        const body: { toLayer: Layer; nameOverride?: string } = { toLayer };
        if (nameOverride !== undefined) body.nameOverride = nameOverride;
        const { data } = await api.post<ProjectResponse>(
          `/model-studio/models/${modelId}/entities/${sourceEntityId}/project`,
          body,
        );
        return data.data;
      } catch (err) {
        const msg = errorMessage(err, 'Failed to scaffold projection');
        setError(msg);
        // Don't toast on 409 — callers typically render a bespoke UX
        // ("Already projected. Jump to it?") and a duplicate toast
        // would just add noise.
        if (!isStatus(err, 409)) {
          toast(msg, 'error');
        }
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        setIsMutating(false);
      }
    },
    [modelId, toast],
  );

  const isAlreadyProjectedError = useCallback((err: unknown) => isStatus(err, 409), []);

  return { isMutating, error, project, isAlreadyProjectedError };
}
