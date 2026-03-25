import { eq, and, desc } from 'drizzle-orm';
import type { FlowConfig, FlowField, FlowStep } from '@cc/shared';
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

  // Extract config for normalized writes
  const { config } = data;

  // Update scalar flow columns
  const [updated] = await db
    .update(schema.flows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId)))
    .returning();

  // Sync normalized tables when config changes
  if (config) {
    if (config.style !== undefined) {
      await db.update(schema.flows)
        .set({ style: config.style ?? null })
        .where(eq(schema.flows.id, flowId));
    }
    await syncFlowFields(flowId, config.fields ?? []);
    await syncFlowSteps(flowId, config.steps ?? []);
  }

  return updated;
}

export async function deleteFlow(flowId: string, userId: string) {
  // Verify ownership
  await getFlowById(flowId, userId);

  await db
    .delete(schema.flows)
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId)));
}

// --- Normalized table sync helpers ---

async function syncFlowFields(flowId: string, fields: FlowField[]) {
  // Delete existing and re-insert (simpler than diffing)
  await db.delete(schema.flowFields).where(eq(schema.flowFields.flowId, flowId));

  if (fields.length === 0) return;

  await db.insert(schema.flowFields).values(
    fields.map((f, i) => ({
      flowId,
      fieldId: f.id,
      type: f.type,
      label: f.label,
      placeholder: f.placeholder ?? null,
      isRequired: f.required ?? false,
      options: f.options ?? [],
      sortOrder: i,
    })),
  );
}

async function syncFlowSteps(flowId: string, steps: FlowStep[]) {
  // Delete existing and re-insert
  await db.delete(schema.flowSteps).where(eq(schema.flowSteps.flowId, flowId));

  if (steps.length === 0) return;

  await db.insert(schema.flowSteps).values(
    steps.map((s, i) => ({
      flowId,
      stepId: s.id,
      skillId: s.skillId ?? null,
      skillVersion: s.skillVersion ?? null,
      model: s.model ?? '',
      provider: s.provider ?? '',
      prompt: s.prompt ?? '',
      capabilities: s.capabilities ?? [],
      inputMappings: s.inputMappings ?? {},
      overrides: s.overrides ?? {},
      editorConfig: s.editor ?? null,
      sortOrder: s.order ?? i,
    })),
  );
}
