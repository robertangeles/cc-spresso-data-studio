/**
 * Migration Test: flows.config → flow_fields + flow_steps
 *
 * Run with: npx tsx packages/server/src/db/migrations/test-flow-migration.ts
 *
 * This script:
 * 1. Reads all flows from the DB
 * 2. Parses each flow's config JSONB
 * 3. Validates the structure
 * 4. Simulates migration (dry run — no writes)
 * 5. Reports: fields count, steps count, any parse errors
 * 6. Exits with code 0 (pass) or 1 (fail)
 */

import { db, pool } from '../index.js';

interface FlowField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface FlowStep {
  id: string;
  skillId?: string;
  skillVersion?: number;
  inputMappings?: Record<string, string>;
  overrides?: { temperature?: number; maxTokens?: number; systemPrompt?: string };
  editor?: {
    enabled: boolean;
    model: string;
    systemPrompt: string;
    maxRounds: number;
    approvalMode: string;
  };
  provider: string;
  model: string;
  prompt: string;
  capabilities: string[];
  order: number;
}

interface FlowConfig {
  fields: FlowField[];
  steps: FlowStep[];
  style?: string;
}

async function testMigration() {
  console.log('=== FLOW CONFIG MIGRATION TEST (DRY RUN) ===\n');

  const flows = await db.query.flows.findMany();
  console.log(`Found ${flows.length} flows to migrate.\n`);

  let totalFields = 0;
  let totalSteps = 0;
  const errors: string[] = [];

  for (const flow of flows) {
    console.log(`--- Flow: "${flow.name}" (${flow.id}) ---`);

    const config = flow.config as FlowConfig;

    // Validate structure
    if (!config) {
      errors.push(`Flow ${flow.id}: config is null/undefined`);
      console.log('  ERROR: config is null');
      continue;
    }

    if (!Array.isArray(config.fields)) {
      errors.push(`Flow ${flow.id}: config.fields is not an array (got ${typeof config.fields})`);
      console.log(`  ERROR: fields is ${typeof config.fields}`);
    } else {
      console.log(`  Fields: ${config.fields.length}`);
      totalFields += config.fields.length;

      // Validate each field
      for (let i = 0; i < config.fields.length; i++) {
        const f = config.fields[i];
        if (!f.id) errors.push(`Flow ${flow.id}: field[${i}] missing id`);
        if (!f.type) errors.push(`Flow ${flow.id}: field[${i}] missing type`);
        if (!f.label) errors.push(`Flow ${flow.id}: field[${i}] missing label`);
        console.log(
          `    [${i}] ${f.type} "${f.label}" (id: ${f.id?.slice(0, 8)}...) required=${f.required ?? false}`,
        );
      }
    }

    if (!Array.isArray(config.steps)) {
      errors.push(`Flow ${flow.id}: config.steps is not an array (got ${typeof config.steps})`);
      console.log(`  ERROR: steps is ${typeof config.steps}`);
    } else {
      console.log(`  Steps: ${config.steps.length}`);
      totalSteps += config.steps.length;

      // Validate each step
      for (let i = 0; i < config.steps.length; i++) {
        const s = config.steps[i];
        if (!s.id) errors.push(`Flow ${flow.id}: step[${i}] missing id`);
        if (s.order === undefined) errors.push(`Flow ${flow.id}: step[${i}] missing order`);
        console.log(
          `    [${i}] skill=${s.skillId?.slice(0, 8) ?? 'raw'} model=${s.model} order=${s.order} mappings=${Object.keys(s.inputMappings ?? {}).length}`,
        );

        if (s.editor?.enabled) {
          console.log(
            `          editor: ${s.editor.model} maxRounds=${s.editor.maxRounds} mode=${s.editor.approvalMode}`,
          );
        }
      }
    }

    console.log('');
  }

  // Summary
  console.log('=== MIGRATION TEST SUMMARY ===');
  console.log(`Flows:       ${flows.length}`);
  console.log(`Total Fields: ${totalFields}`);
  console.log(`Total Steps:  ${totalSteps}`);
  console.log(`Errors:       ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\nMIGRATION TEST: FAILED');
    await pool.end();
    process.exit(1);
  }

  console.log('\nMIGRATION TEST: PASSED');
  console.log('All flows have valid config structure. Safe to proceed with migration.');
  await pool.end();
  process.exit(0);
}

testMigration().catch((err) => {
  console.error('Migration test crashed:', err);
  process.exit(1);
});
