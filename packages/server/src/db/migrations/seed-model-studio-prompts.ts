/**
 * Seeds the Model Studio system prompts so DB-backed prompts (per
 * feedback_no_hardcoded_prompts) are available before the feature is used.
 *
 * Run with:
 *   npx tsx packages/server/src/db/migrations/seed-model-studio-prompts.ts
 *
 * Idempotent: each row is upserted by `slug`. Safe to run repeatedly.
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

interface PromptSeed {
  slug: string;
  name: string;
  description: string;
  body: string;
  category: string;
}

const ENTITY_AUTO_DESCRIBE_BODY = `You are an expert data architect writing concise documentation for an entity inside a data model.

Given the entity's name, business name (if any), layer (conceptual / logical / physical), and any existing description, write a NEW description that:

1. Explains what real-world thing the entity represents in 2–4 short sentences.
2. Names typical attributes (without inventing exact column names) and the kinds of relationships the entity is likely to participate in.
3. Calls out any notable constraints or business rules a senior data architect would want documented.
4. Uses plain English understandable to a business stakeholder, not just engineers.

Output rules:
- Return PROSE only. No headings. No bullet lists. No markdown.
- Maximum 600 characters.
- Do NOT begin with "This entity" or restate the name. Start with a substantive sentence.
- If the user input is unclear or unsafe to describe, return exactly: "I cannot generate a description for this entity."`;

const PROMPTS: PromptSeed[] = [
  {
    slug: 'model-studio-entity-auto-describe',
    name: 'Model Studio — Entity auto-describe (D5)',
    description:
      'Generates a short, plain-English description of a data-model entity for the Auto-describe button.',
    body: ENTITY_AUTO_DESCRIBE_BODY,
    category: 'model-studio',
  },
];

async function seed() {
  console.log('=== SEED model-studio system_prompts ===\n');
  let inserted = 0;
  let updated = 0;

  for (const p of PROMPTS) {
    const existing = await db.query.systemPrompts.findFirst({
      where: (t, { eq }) => eq(t.slug, p.slug),
    });

    if (existing) {
      await db
        .update(schema.systemPrompts)
        .set({
          name: p.name,
          description: p.description,
          body: p.body,
          category: p.category,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.systemPrompts.slug, p.slug));
      updated += 1;
      console.log(`  UPDATE  "${p.name}" (${p.slug})`);
    } else {
      await db.insert(schema.systemPrompts).values({
        slug: p.slug,
        name: p.name,
        description: p.description,
        body: p.body,
        category: p.category,
        isActive: true,
      });
      inserted += 1;
      console.log(`  INSERT  "${p.name}" (${p.slug})`);
    }
  }

  console.log(`\nInserted: ${inserted}, Updated: ${updated}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('seed-model-studio-prompts failed:', err);
  process.exit(1);
});
