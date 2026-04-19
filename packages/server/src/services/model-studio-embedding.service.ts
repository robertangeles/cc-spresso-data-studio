import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dataModelEmbeddingJobs } from '../db/schema.js';
import { logger } from '../config/logger.js';

/**
 * Embedding-job enqueue helper.
 *
 * Step 4 wires this from entity create / update / auto-describe so
 * the (unbuilt) Step 10 RAG worker has a queue to drain. We enqueue
 * synchronously but never fail the parent mutation if the queue write
 * itself trips — losing an embedding is recoverable, losing the
 * user's entity edit is not.
 *
 * Dedupe: hash the content body. If the latest pending job for the
 * same `(object_id, contentDigest)` is still pending, do nothing.
 * Same digest + already-processed job → enqueue again (idempotent
 * regenerate path). Different digest → always enqueue.
 *
 * The Step 10 worker is responsible for marking jobs `processing`
 * and `done`; this module only writes `pending` rows.
 */

export type EmbeddingObjectType = 'entity' | 'attribute' | 'relationship' | 'model';

export interface EnqueueEmbeddingInput {
  dataModelId: string;
  objectId: string;
  objectType: EmbeddingObjectType;
  /** Concatenated content the worker will embed (name + description, etc.). */
  content: string;
}

export function digestContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function enqueueEmbedding(input: EnqueueEmbeddingInput): Promise<void> {
  if (!input.content.trim()) return;
  const contentDigest = digestContent(input.content);
  try {
    const [existing] = await db
      .select({ id: dataModelEmbeddingJobs.id, status: dataModelEmbeddingJobs.status })
      .from(dataModelEmbeddingJobs)
      .where(
        and(
          eq(dataModelEmbeddingJobs.objectId, input.objectId),
          eq(dataModelEmbeddingJobs.contentDigest, contentDigest),
          eq(dataModelEmbeddingJobs.status, 'pending'),
        ),
      )
      .orderBy(sql`created_at desc`)
      .limit(1);
    if (existing) return;

    await db.insert(dataModelEmbeddingJobs).values({
      dataModelId: input.dataModelId,
      objectId: input.objectId,
      objectType: input.objectType,
      contentDigest,
      content: input.content,
      status: 'pending',
    });
  } catch (err) {
    logger.error(
      {
        err,
        dataModelId: input.dataModelId,
        objectId: input.objectId,
        objectType: input.objectType,
      },
      'embedding-job enqueue failed — RAG freshness alert',
    );
  }
}
