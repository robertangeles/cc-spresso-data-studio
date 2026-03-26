/**
 * Fix: Update skill scalar columns from config JSONB
 * (Run after migrate-skill-config.ts if scalar updates failed)
 *
 * Run with: npx tsx packages/server/src/db/migrations/fix-skill-scalars.ts
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

interface SkillConfig {
  promptTemplate: string;
  systemPrompt?: string;
  capabilities: string[];
  defaultProvider?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
}

async function fixScalars() {
  console.log('=== FIX SKILL SCALAR COLUMNS ===\n');

  const skills = await db.query.skills.findMany();
  let updated = 0;
  const errors: string[] = [];

  for (const skill of skills) {
    const config = skill.config as SkillConfig;
    if (!config) continue;

    // Skip if already populated
    if (skill.promptTemplate) {
      console.log(`  SKIP "${skill.name}": promptTemplate already set`);
      continue;
    }

    try {
      await db
        .update(schema.skills)
        .set({
          promptTemplate: config.promptTemplate ?? null,
          systemPrompt: config.systemPrompt ?? null,
          capabilities: config.capabilities ?? [],
          defaultProvider: config.defaultProvider ?? null,
          defaultModel: config.defaultModel ?? null,
          temperature: config.temperature ?? null,
          maxTokens: config.maxTokens ?? null,
        })
        .where(eq(schema.skills.id, skill.id));
      updated++;
      console.log(
        `  ✓ "${skill.name}": template=${config.promptTemplate?.length ?? 0} chars, temp=${config.temperature ?? 'default'}`,
      );
    } catch (err) {
      errors.push(`${skill.id}: ${err}`);
      console.log(`  ✗ "${skill.name}": ${err}`);
    }
  }

  console.log(`\n=== SUMMARY: ${updated} updated, ${errors.length} errors ===`);
  if (errors.length > 0) {
    errors.forEach((e) => console.log(`  ✗ ${e}`));
  }

  await pool.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

fixScalars().catch((err) => {
  console.error('Script crashed:', err);
  process.exit(1);
});
