import { eq, and, desc } from 'drizzle-orm';
import type { FlowConfig } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export async function createFlow(userId: string, name: string, description?: string) {
  const [flow] = await db
    .insert(schema.flows)
    .values({ userId, name, description: description ?? null })
    .returning();

  return flow;
}

export async function getFlows(userId: string) {
  return db.query.flows.findMany({
    where: eq(schema.flows.userId, userId),
    orderBy: [desc(schema.flows.updatedAt)],
  });
}

export async function getFlowById(flowId: string, userId: string) {
  const flow = await db.query.flows.findFirst({
    where: eq(schema.flows.id, flowId),
  });

  if (!flow) {
    throw new NotFoundError('Flow');
  }

  if (flow.userId !== userId) {
    throw new ForbiddenError('You do not have access to this flow');
  }

  return flow;
}

export async function updateFlow(
  flowId: string,
  userId: string,
  data: { name?: string; description?: string | null; status?: string; config?: FlowConfig },
) {
  // Verify ownership
  await getFlowById(flowId, userId);

  const [updated] = await db
    .update(schema.flows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId)))
    .returning();

  return updated;
}

export async function deleteFlow(flowId: string, userId: string) {
  // Verify ownership
  await getFlowById(flowId, userId);

  await db
    .delete(schema.flows)
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId)));
}
