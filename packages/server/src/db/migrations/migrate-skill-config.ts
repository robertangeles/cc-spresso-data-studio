/**
 * Migration: skills.config → skill_inputs + skill_outputs + skill scalar columns
 *
 * Run with: npx tsx packages/server/src/db/migrations/migrate-skill-config.ts
 *
 * This script:
 * 1. Reads all skills
 * 2. For each skill, parses config.inputs → inserts into skill_inputs
 * 3. For each skill, parses config.outputs → inserts into skill_outputs
 * 4. Copies scalar fields (promptTemplate, systemPrompt, etc.) to skills columns
 * 5. Verifies: count in new tables matches count in JSONB
 * 6. Does NOT delete the config JSONB (kept as backup)
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

interface SkillInput {
  id: string;
  key: string;
  type: string;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

interface SkillOutput {
  key: string;
  type: string;
  label: string;
  description?: string;
  visible?: boolean;
}

interface SkillConfig {
  inputs: SkillInput[];
  outputs: SkillOutput[];
  promptTemplate: string;
  systemPrompt?: string;
  capabilities: string[];
  defaultProvider?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
}

async function migrate() {
  console.log('=== SKILL CONFIG MIGRATION ===\n');

  const skills = await db.query.skills.findMany();
  console.log(`Migrating ${skills.length} skills...\n`);

  let totalInputsInserted = 0;
  let totalOutputsInserted = 0;
  let scalarUpdates = 0;
  let errors: string[] = [];

  for (const skill of skills) {
    console.log(`--- Skill: "${skill.name}" (${skill.id}) ---`);
    const config = skill.config as SkillConfig;

    if (!config) {
      errors.push(`Skill ${skill.id}: config is null`);
      continue;
    }

    // Check if already migrated (skill_inputs exist for this skill)
    const existingInputs = await db.query.skillInputs.findMany({
      where: eq(schema.skillInputs.skillId, skill.id),
    });
    if (existingInputs.length > 0) {
      console.log(`  SKIPPED: already has ${existingInputs.length} skill_inputs records`);
      continue;
    }

    // Migrate inputs
    if (config.inputs && config.inputs.length > 0) {
      for (let i = 0; i < config.inputs.length; i++) {
        const inp = config.inputs[i];
        try {
          await db.insert(schema.skillInputs).values({
            skillId: skill.id,
            inputId: inp.id ?? inp.key,
            key: inp.key,
            type: inp.type,
            label: inp.label,
            description: inp.description ?? null,
            isRequired: inp.required ?? false,
            defaultValue: inp.defaultValue ?? null,
            options: inp.options ?? [],
            sortOrder: i,
          });
          totalInputsInserted++;
        } catch (err) {
          const msg = `Skill ${skill.id}: failed to insert input[${i}] "${inp.label}": ${err}`;
          errors.push(msg);
          console.log(`  ERROR: ${msg}`);
        }
      }
      console.log(`  Inputs inserted: ${config.inputs.length}`);
    }

    // Migrate outputs
    if (config.outputs && config.outputs.length > 0) {
      for (let i = 0; i < config.outputs.length; i++) {
        const out = config.outputs[i];
        try {
          await db.insert(schema.skillOutputs).values({
            skillId: skill.id,
            key: out.key,
            type: out.type,
            label: out.label,
            description: out.description ?? null,
            isVisible: out.visible ?? true,
            sortOrder: i,
          });
          totalOutputsInserted++;
        } catch (err) {
          const msg = `Skill ${skill.id}: failed to insert output[${i}] "${out.label}": ${err}`;
          errors.push(msg);
          console.log(`  ERROR: ${msg}`);
        }
      }
      console.log(`  Outputs inserted: ${config.outputs.length}`);
    }

    // Update scalar columns on skills table
    try {
      await db.update(schema.skills)
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
      scalarUpdates++;
      console.log(`  Scalars updated: promptTemplate=${config.promptTemplate ? `${config.promptTemplate.length} chars` : 'none'}, temperature=${config.temperature ?? 'default'}, maxTokens=${config.maxTokens ?? 'default'}`);
    } catch (err) {
      const msg = `Skill ${skill.id}: failed to update scalar columns: ${err}`;
      errors.push(msg);
      console.log(`  ERROR: ${msg}`);
    }
  }

  // Verification
  console.log('\n=== VERIFICATION ===');

  for (const skill of skills) {
    const config = skill.config as SkillConfig;
    const inputRows = await db.query.skillInputs.findMany({
      where: eq(schema.skillInputs.skillId, skill.id),
    });
    const outputRows = await db.query.skillOutputs.findMany({
      where: eq(schema.skillOutputs.skillId, skill.id),
    });

    const inputsMatch = inputRows.length === (config.inputs?.length ?? 0);
    const outputsMatch = outputRows.length === (config.outputs?.length ?? 0);

    console.log(`Skill "${skill.name}": inputs ${inputRows.length}/${config.inputs?.length ?? 0} ${inputsMatch ? '✓' : '✗'} | outputs ${outputRows.length}/${config.outputs?.length ?? 0} ${outputsMatch ? '✓' : '✗'}`);

    if (!inputsMatch) errors.push(`Skill ${skill.id}: input count mismatch ${inputRows.length} vs ${config.inputs?.length}`);
    if (!outputsMatch) errors.push(`Skill ${skill.id}: output count mismatch ${outputRows.length} vs ${config.outputs?.length}`);
  }

  // Summary
  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Skills processed:   ${skills.length}`);
  console.log(`Inputs inserted:    ${totalInputsInserted}`);
  console.log(`Outputs inserted:   ${totalOutputsInserted}`);
  console.log(`Scalar updates:     ${scalarUpdates}`);
  console.log(`Errors:             ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\nMIGRATION: COMPLETED WITH ERRORS');
  } else {
    console.log('\nMIGRATION: SUCCESS');
    console.log('Config JSONB preserved as backup. Remove after verifying app works.');
  }

  await pool.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

migrate().catch((err) => {
  console.error('Migration crashed:', err);
  process.exit(1);
});
