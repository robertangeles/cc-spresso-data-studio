/**
 * Migration Test: skills.config → skill_inputs + skill_outputs + skill columns
 *
 * Run with: npx tsx packages/server/src/db/migrations/test-skill-migration.ts
 */

import { db, pool } from '../index.js';

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

async function testMigration() {
  console.log('=== SKILL CONFIG MIGRATION TEST (DRY RUN) ===\n');

  const skills = await db.query.skills.findMany();
  console.log(`Found ${skills.length} skills to migrate.\n`);

  let totalInputs = 0;
  let totalOutputs = 0;
  let errors: string[] = [];

  for (const skill of skills) {
    console.log(`--- Skill: "${skill.name}" (${skill.id}) ---`);

    const config = skill.config as SkillConfig;

    if (!config) {
      errors.push(`Skill ${skill.id}: config is null`);
      continue;
    }

    // Validate inputs
    if (!Array.isArray(config.inputs)) {
      errors.push(`Skill ${skill.id}: inputs is not an array`);
    } else {
      totalInputs += config.inputs.length;
      console.log(`  Inputs: ${config.inputs.length}`);
      for (let i = 0; i < config.inputs.length; i++) {
        const inp = config.inputs[i];
        if (!inp.key) errors.push(`Skill ${skill.id}: input[${i}] missing key`);
        if (!inp.type) errors.push(`Skill ${skill.id}: input[${i}] missing type`);
        console.log(`    [${i}] ${inp.type} "${inp.label}" key=${inp.key} required=${inp.required}`);
      }
    }

    // Validate outputs
    if (!Array.isArray(config.outputs)) {
      errors.push(`Skill ${skill.id}: outputs is not an array`);
    } else {
      totalOutputs += config.outputs.length;
      console.log(`  Outputs: ${config.outputs.length}`);
      for (let i = 0; i < config.outputs.length; i++) {
        const out = config.outputs[i];
        if (!out.key) errors.push(`Skill ${skill.id}: output[${i}] missing key`);
        console.log(`    [${i}] ${out.type} "${out.label}" key=${out.key}`);
      }
    }

    // Validate scalar fields
    console.log(`  promptTemplate: ${config.promptTemplate ? `${config.promptTemplate.length} chars` : 'MISSING'}`);
    if (!config.promptTemplate) errors.push(`Skill ${skill.id}: missing promptTemplate`);
    console.log(`  systemPrompt: ${config.systemPrompt ? `${config.systemPrompt.length} chars` : 'none'}`);
    console.log(`  temperature: ${config.temperature ?? 'default'}, maxTokens: ${config.maxTokens ?? 'default'}`);
    console.log(`  defaultModel: ${config.defaultModel ?? 'none'}`);
    console.log('');
  }

  console.log('=== MIGRATION TEST SUMMARY ===');
  console.log(`Skills:        ${skills.length}`);
  console.log(`Total Inputs:  ${totalInputs}`);
  console.log(`Total Outputs: ${totalOutputs}`);
  console.log(`Errors:        ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\nMIGRATION TEST: FAILED');
    await pool.end();
    process.exit(1);
  }

  console.log('\nMIGRATION TEST: PASSED');
  await pool.end();
  process.exit(0);
}

testMigration().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
