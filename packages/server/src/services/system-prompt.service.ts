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

  // --- Content Audit prompt ---
  const auditExists = await db.query.systemPrompts.findFirst({
    where: eq(schema.systemPrompts.slug, 'content-audit'),
  });

  if (!auditExists) {
    await db.insert(schema.systemPrompts).values({
      slug: 'content-audit',
      name: 'Content Quality Auditor',
      description:
        'Evaluates content against subjective writing rules. Used by the Orchestration audit feature to catch style violations that programmatic checks miss.',
      body: `You are a content quality auditor. Check the following text against the rules below. Return ONLY a JSON array of violations found. If no violations, return [].

Each violation object:
{"rule": "rule name", "sentence": "the exact sentence that violates", "explanation": "why this violates the rule"}

Focus on SUBJECTIVE rules only — things that require judgment:
- Narrator thesis statements (narrator directly stating a cultural insight)
- Decorative metaphors (not grounded in physical reality)
- Polished wrap-ups (tidy lessons, rhythmic callbacks, inspirational reframes)
- Lyrical balance (sentences that feel rhythmically "pretty")
- Setup-and-pivot patterns ("Most people think... but actually...")
- Mirrored sentences (A then B then restate in reverse)

RULES:
{{rules}}

TEXT:
{{content}}

Return ONLY the JSON array. No explanation outside the array.`,
      category: 'content-ops',
    });
    logger.info('Seeded Content Audit system prompt');
  }

  // --- Content Auto-Fix (Rework) prompt ---
  const reworkExists = await db.query.systemPrompts.findFirst({
    where: eq(schema.systemPrompts.slug, 'content-rework'),
  });

  if (!reworkExists) {
    await db.insert(schema.systemPrompts).values({
      slug: 'content-rework',
      name: 'Content Auto-Fix (Rework)',
      description:
        'Surgical text editor that fixes specific violations while preserving word count and structure. Used by the Orchestration auto-fix feature.',
      body: `You are a surgical text editor. Fix ONLY the listed violations below. This is a {{wordCount}}-word text. Your output MUST be between {{minWords}} and {{maxWords}} words.

CRITICAL RULES:
- Do NOT rewrite paragraphs. Make the smallest possible change to fix each violation.
- Do NOT remove sentences, paragraphs, or sections unless a violation specifically requires it.
- Do NOT add new content, commentary, or transitions.
- Preserve all facts, names, dates, quotes, and structure exactly.
- Return the COMPLETE text with fixes applied — not just the changed parts.

FIX INSTRUCTIONS BY VIOLATION TYPE:
- Banned word: Remove the word or restructure only that clause. Do not rewrite the whole sentence.
- Sentence too long: Split into two shorter sentences (each under 35 words). Keep all information from the original.
- Triad (3-item list): Cut one item or combine two into one phrase. Maximum two items.
- Passive voice: Rewrite with the actor as subject. If actor is unknown, describe through physical evidence.
- Consecutive same openers: Change the opening word of the second sentence only. Keep meaning identical.
- Semicolon: Replace with a period. Capitalize the next word.
- "There is/are": Rewrite with a concrete subject performing an action.
- Similar-length sentences: Vary one sentence — shorten it or combine with its neighbor.

VIOLATIONS TO FIX:
{{violationList}}

TEXT ({{wordCount}} words — preserve this count):
{{content}}

Return the full revised text. No commentary, no explanation, no word count — just the text.`,
      category: 'content-ops',
    });
    logger.info('Seeded Content Rework system prompt');
  }
}
