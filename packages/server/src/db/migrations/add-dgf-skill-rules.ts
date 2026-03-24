/**
 * Append 3 DGF-specific rules to the Spresso DGF Essays skill prompt
 * Run with: npx tsx packages/server/src/db/migrations/add-dgf-skill-rules.ts
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

const SKILL_ID = '0d9bfd5b-3099-4158-b282-78dfe8fb0762';

const NEW_RULES_SECTION = `

---

### Precision and Voice

**Specifics earn their place.** Use precise numbers and measurements when they matter (ten percent sucrose, three weeks of soaking, November to April). Never use vague quantities (some, a lot, several, many, a few). If you do not know the exact number, describe the process or physical evidence instead of guessing.

**Questions as structural devices only.** Use at most one question per essay. A question must redirect the reader's attention to a specific tension, gap, or turning point — not decorate. Never use rhetorical questions. Never answer a question in the sentence immediately following it.

**Process through people.** Describe processes through the people who perform them, not as disembodied sequences. "Workers press the cane" not "The cane is pressed." "She checks the color" not "The color is checked." When the actor is genuinely unknown, describe the action through its physical evidence — what you would see, hear, or smell if you stood in the room.`;

async function update() {
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, SKILL_ID),
  });

  if (!skill) {
    console.log('Skill not found');
    await pool.end();
    return;
  }

  console.log(`Skill: ${skill.name}`);
  console.log(`Current template: ${skill.promptTemplate?.length ?? 0} chars`);

  // Check if already added
  if (skill.promptTemplate?.includes('Specifics earn their place')) {
    console.log('Rules already present — skipping');
    await pool.end();
    return;
  }

  // Insert before "### Output Format" if it exists, otherwise append at end
  let newTemplate: string;
  const outputFormatMarker = '### Output Format';

  if (skill.promptTemplate?.includes(outputFormatMarker)) {
    newTemplate = skill.promptTemplate.replace(
      outputFormatMarker,
      NEW_RULES_SECTION + '\n\n---\n\n' + outputFormatMarker,
    );
  } else {
    newTemplate = (skill.promptTemplate ?? '') + NEW_RULES_SECTION;
  }

  await db.update(schema.skills)
    .set({ promptTemplate: newTemplate, updatedAt: new Date() })
    .where(eq(schema.skills.id, SKILL_ID));

  // Also update the config JSONB for backward compat
  if (skill.config && typeof skill.config === 'object') {
    const config = skill.config as Record<string, unknown>;
    config.promptTemplate = newTemplate;
    await db.update(schema.skills)
      .set({ config })
      .where(eq(schema.skills.id, SKILL_ID));
  }

  console.log(`Updated template: ${newTemplate.length} chars`);
  console.log('✓ 3 DGF-specific rules added to skill prompt');
  await pool.end();
}

update().catch((err) => { console.error(err); process.exit(1); });
