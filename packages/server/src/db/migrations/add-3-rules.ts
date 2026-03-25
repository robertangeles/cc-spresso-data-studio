/**
 * Add 3 new writing rules to the Rules Engine
 * Run with: npx tsx packages/server/src/db/migrations/add-3-rules.ts
 */

import { db, pool, schema } from '../index.js';

async function addRules() {
  // Get user ID from existing rules
  const existing = await db.query.userRules.findMany();
  if (existing.length === 0) {
    console.log('No existing rules found — cannot determine userId');
    await pool.end();
    return;
  }
  const userId = existing[0].userId;
  console.log(`Adding rules for user: ${userId}\n`);

  const newRules = [
    {
      name: 'Specifics Earn Their Place',
      category: 'writing',
      rules: `Use precise numbers and measurements when they matter (ten percent sucrose, three weeks of soaking, November to April). Never use vague quantities (some, a lot, several, many, a few). If you do not know the exact number, describe the process or physical evidence instead of guessing. Round numbers are acceptable when the precision is not the point.`,
    },
    {
      name: 'Questions as Structural Devices',
      category: 'writing',
      rules: `Use at most one question per essay or content piece. A question must redirect the reader's attention to a specific tension, gap, or turning point — not decorate. Never use rhetorical questions. Never answer a question in the sentence immediately following it. If you find yourself writing a question, ask whether the same redirect works as a declarative sentence. If it does, use the declarative.`,
    },
    {
      name: 'Process Through People',
      category: 'writing',
      rules: `Describe processes through the people who perform them, not as disembodied sequences. "Workers press the cane" not "The cane is pressed." "She checks the color" not "The color is checked." When the actor is genuinely unknown, describe the action through its physical evidence — what you would see, hear, or smell if you stood in the room. Never narrate a process as if watching a diagram.`,
    },
  ];

  for (const rule of newRules) {
    // Check if already exists
    const dup = existing.find((r) => r.name === rule.name);
    if (dup) {
      console.log(`SKIP "${rule.name}" — already exists`);
      continue;
    }

    await db.insert(schema.userRules).values({
      userId,
      name: rule.name,
      rules: rule.rules,
      category: rule.category,
      isActive: true,
    });
    console.log(`✓ Added "${rule.name}"`);
  }

  console.log('\nDone.');
  await pool.end();
}

addRules().catch((err) => { console.error(err); process.exit(1); });
