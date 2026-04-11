import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { providerRegistry } from './ai/provider.registry.js';
import { APEX_SYSTEM_PROMPT } from '../prompts/apex-system.js';

// --- Prompt CRUD ---

export async function listPrompts(userId: string, category?: string) {
  const conditions = [eq(schema.prompts.userId, userId), eq(schema.prompts.isActive, true)];

  if (category) {
    conditions.push(eq(schema.prompts.category, category));
  }

  return db.query.prompts.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.prompts.updatedAt)],
  });
}

export async function getPrompt(id: string, userId: string) {
  const prompt = await db.query.prompts.findFirst({
    where: eq(schema.prompts.id, id),
  });

  if (!prompt) throw new NotFoundError('Prompt not found');
  if (prompt.userId !== userId) throw new ForbiddenError('Access denied');

  return prompt;
}

export async function getPromptWithVersions(id: string, userId: string) {
  const prompt = await getPrompt(id, userId);

  const versions = await db.query.promptVersions.findMany({
    where: eq(schema.promptVersions.promptId, id),
    orderBy: [desc(schema.promptVersions.version)],
  });

  return { ...prompt, versions };
}

interface CreatePromptData {
  userId: string;
  name: string;
  description?: string;
  body: string;
  defaultModel?: string;
  category?: string;
}

export async function createPrompt(data: CreatePromptData) {
  const [prompt] = await db
    .insert(schema.prompts)
    .values({
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      body: data.body,
      defaultModel: data.defaultModel ?? null,
      category: data.category ?? 'custom',
    })
    .returning();

  // Create version 1
  await db.insert(schema.promptVersions).values({
    promptId: prompt.id,
    version: 1,
    body: data.body,
    defaultModel: data.defaultModel ?? null,
    changelog: 'Initial version',
  });

  logger.info({ promptId: prompt.id }, 'Prompt created');
  return prompt;
}

interface UpdatePromptData {
  name?: string;
  description?: string;
  body?: string;
  defaultModel?: string;
  category?: string;
  changelog?: string;
}

export async function updatePrompt(id: string, data: UpdatePromptData, userId: string) {
  const prompt = await getPrompt(id, userId);

  // Snapshot current state into prompt_versions before applying updates
  await db.insert(schema.promptVersions).values({
    promptId: prompt.id,
    version: prompt.currentVersion,
    body: prompt.body,
    defaultModel: prompt.defaultModel ?? null,
    changelog: data.changelog ?? null,
  });

  const newVersion = prompt.currentVersion + 1;

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    currentVersion: newVersion,
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.body !== undefined) updates.body = data.body;
  if (data.defaultModel !== undefined) updates.defaultModel = data.defaultModel;
  if (data.category !== undefined) updates.category = data.category;

  const [updated] = await db
    .update(schema.prompts)
    .set(updates)
    .where(eq(schema.prompts.id, prompt.id))
    .returning();

  logger.info({ promptId: id, version: newVersion }, 'Prompt updated');
  return updated;
}

export async function deletePrompt(id: string, userId: string) {
  await getPrompt(id, userId);

  const [updated] = await db
    .update(schema.prompts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.prompts.id, id))
    .returning();

  logger.info({ promptId: id }, 'Prompt soft-deleted');
  return updated;
}

// --- Version queries ---

export async function listPromptVersions(promptId: string, userId: string) {
  // Ownership check via getPrompt
  await getPrompt(promptId, userId);

  return db.query.promptVersions.findMany({
    where: eq(schema.promptVersions.promptId, promptId),
    orderBy: [desc(schema.promptVersions.version)],
  });
}

export async function revertPrompt(id: string, version: number, userId: string) {
  const prompt = await getPrompt(id, userId);

  const targetVersion = await db.query.promptVersions.findFirst({
    where: and(eq(schema.promptVersions.promptId, id), eq(schema.promptVersions.version, version)),
  });

  if (!targetVersion) throw new NotFoundError(`Prompt version ${version} not found`);

  // Snapshot current state before reverting
  const newVersionNumber = prompt.currentVersion + 1;

  await db.insert(schema.promptVersions).values({
    promptId: id,
    version: newVersionNumber,
    body: targetVersion.body,
    defaultModel: targetVersion.defaultModel ?? null,
    changelog: `Reverted to version ${version}`,
  });

  const [updated] = await db
    .update(schema.prompts)
    .set({
      body: targetVersion.body,
      defaultModel: targetVersion.defaultModel,
      currentVersion: newVersionNumber,
      updatedAt: new Date(),
    })
    .where(eq(schema.prompts.id, id))
    .returning();

  logger.info(
    { promptId: id, revertedTo: version, newVersion: newVersionNumber },
    'Prompt reverted',
  );
  return updated;
}

// --- APEX Prompt Generation ---

export async function generateApexPrompt(data: {
  persona: string;
  useCase: string;
  constraints: string[];
  outputFormat: string;
  targetAudience: string;
  model?: string;
}) {
  const registry = providerRegistry;

  const userMessage = `Generate a prompt for the following:

Persona: ${data.persona}
Use Case: ${data.useCase}
Constraints: ${data.constraints.length > 0 ? data.constraints.join(', ') : 'None'}
Desired Output Format: ${data.outputFormat}
Target Audience: ${data.targetAudience}`;

  const model = data.model || 'anthropic/claude-haiku-4-5';

  logger.info({ model, persona: data.persona }, 'APEX prompt generation started');

  const response = await registry.complete({
    model,
    messages: [
      { role: 'system', content: APEX_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    maxTokens: 4000,
  });

  // Parse JSON response
  let parsed;
  try {
    // Strip markdown code fences if present
    let content = response.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(content);
  } catch (err) {
    logger.error(
      { err, content: response.content.slice(0, 500) },
      'APEX: failed to parse AI response as JSON',
    );
    // Fallback: use the raw response as the prompt
    parsed = {
      suggestedName: `${data.persona} - ${data.useCase.slice(0, 30)}`,
      framework: 'Custom',
      complexity: 'Moderate',
      generatedPrompt: response.content,
    };
  }

  return {
    suggestedName: parsed.suggestedName || `${data.persona} Prompt`,
    generatedPrompt: parsed.generatedPrompt || response.content,
    framework: parsed.framework || 'Custom',
    complexity: parsed.complexity || 'Moderate',
  };
}
