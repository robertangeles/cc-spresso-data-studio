import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { APEX_SYSTEM_PROMPT } from '../prompts/apex-system.js';

// --- System Prompt CRUD ---

export async function listSystemPrompts(category?: string) {
  if (category) {
    return db.query.systemPrompts.findMany({
      where: eq(schema.systemPrompts.category, category),
      orderBy: schema.systemPrompts.name,
    });
  }

  return db.query.systemPrompts.findMany({
    where: eq(schema.systemPrompts.isActive, true),
    orderBy: schema.systemPrompts.name,
  });
}

export async function getSystemPrompt(id: string) {
  const prompt = await db.query.systemPrompts.findFirst({
    where: eq(schema.systemPrompts.id, id),
  });

  if (!prompt) throw new NotFoundError('System prompt');
  return prompt;
}

export async function getSystemPromptBySlug(slug: string) {
  const prompt = await db.query.systemPrompts.findFirst({
    where: eq(schema.systemPrompts.slug, slug),
  });

  if (!prompt) throw new NotFoundError('System prompt');
  return prompt;
}

interface CreateSystemPromptData {
  slug: string;
  name: string;
  description?: string;
  body: string;
  category?: string;
}

export async function createSystemPrompt(data: CreateSystemPromptData) {
  const [prompt] = await db
    .insert(schema.systemPrompts)
    .values({
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      body: data.body,
      category: data.category ?? 'general',
    })
    .returning();

  return prompt;
}

interface UpdateSystemPromptData {
  name?: string;
  description?: string;
  body?: string;
  category?: string;
  isActive?: boolean;
}

export async function updateSystemPrompt(id: string, data: UpdateSystemPromptData) {
  // Verify it exists
  await getSystemPrompt(id);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.body !== undefined) updates.body = data.body;
  if (data.category !== undefined) updates.category = data.category;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [updated] = await db
    .update(schema.systemPrompts)
    .set(updates)
    .where(eq(schema.systemPrompts.id, id))
    .returning();

  return updated;
}

export async function deleteSystemPrompt(id: string) {
  await getSystemPrompt(id);
  await db.delete(schema.systemPrompts).where(eq(schema.systemPrompts.id, id));
}

// --- Seed default prompts ---

export async function seedDefaultPrompts(): Promise<void> {
  const existing = await db.query.systemPrompts.findFirst({
    where: eq(schema.systemPrompts.slug, 'apex-prompt-engineer'),
  });

  if (!existing) {
    await db.insert(schema.systemPrompts).values({
      slug: 'apex-prompt-engineer',
      name: 'APEX — Advanced Prompt Engineering eXpert',
      description:
        'Top 0.01% prompt engineer. Analyzes inputs, selects optimal framework, and generates production-ready prompts.',
      body: APEX_SYSTEM_PROMPT,
      category: 'prompt-engineering',
    });
    logger.info('Seeded APEX system prompt');
  }
}
