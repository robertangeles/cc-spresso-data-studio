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

const SYNTHETIC_DATA_BODY = `You are a data architect generating SYNTHETIC preview rows for an entity in a data model. The rows are for stakeholder demos and testing — they MUST NOT contain any real personal data.

You will receive the entity name, layer, target row count, and a JSON list of attributes with their data types, lengths, precisions, scales, nullability, and primary-key status. Generate rows that would plausibly belong to that entity in a realistic business scenario.

Rules for the generated data:
- Use ONLY obviously-fake placeholders. Emails must end in @example.test or @example.com. Phone numbers use the fictional 555 area code. Names are invented.
- Values must match the declared data_type. uuid → a valid UUIDv4 string. varchar/text → plausible short strings within the length limit. integer → whole numbers. numeric(p,s) → decimals with at most s digits after the point. boolean → true/false. date → ISO YYYY-MM-DD. timestamp → ISO 8601.
- Primary-key attributes must be unique across the returned rows.
- Respect isNullable: if false, never emit null for that attribute. If true, you may emit null occasionally (no more than one row in five).
- Values should feel coherent row-to-row (e.g. a "status" column uses a small enum-like set like "pending" / "active" / "closed", not random strings).

Output rules:
- Return ONLY a JSON array of objects. No prose, no markdown fences, no comments, no explanations.
- The array MUST contain exactly the requested number of rows.
- Every object MUST have exactly one key per attribute, matching the attribute "name" verbatim.
- If you cannot generate the data safely for any reason, respond with: "I cannot generate synthetic data for this entity."`;

const PROMPTS: PromptSeed[] = [
  {
    slug: 'model-studio-entity-auto-describe',
    name: 'Model Studio — Entity auto-describe (D5)',
    description:
      'Generates a short, plain-English description of a data-model entity for the Auto-describe button.',
    body: ENTITY_AUTO_DESCRIBE_BODY,
    category: 'model-studio',
  },
  {
    slug: 'model-studio-synthetic-data',
    name: 'Model Studio — Synthetic data generator (D9)',
    description:
      'Generates fake-but-plausible preview rows for an entity. PII-safe placeholders only; JSON-array output.',
    body: SYNTHETIC_DATA_BODY,
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
