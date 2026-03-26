/**
 * Migration: flows.config → flow_fields + flow_steps
 *
 * Run with: npx tsx packages/server/src/db/migrations/migrate-flow-config.ts
 *
 * This script:
 * 1. Reads all flows
 * 2. For each flow, parses config.fields → inserts into flow_fields
 * 3. For each flow, parses config.steps → inserts into flow_steps
 * 4. Verifies: count in new tables matches count in JSONB
 * 5. Does NOT delete the config JSONB (kept as backup)
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

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
  overrides?: Record<string, unknown>;
  editor?: Record<string, unknown>;
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

async function migrate() {
  console.log('=== FLOW CONFIG MIGRATION ===\n');

  const flows = await db.query.flows.findMany();
  console.log(`Migrating ${flows.length} flows...\n`);

  let totalFieldsInserted = 0;
  let totalStepsInserted = 0;
  const errors: string[] = [];

  for (const flow of flows) {
    console.log(`--- Flow: "${flow.name}" (${flow.id}) ---`);
    const config = flow.config as FlowConfig;

    // Check if already migrated (flow_fields exist for this flow)
    const existingFields = await db.query.flowFields.findMany({
      where: eq(schema.flowFields.flowId, flow.id),
    });
    if (existingFields.length > 0) {
      console.log(`  SKIPPED: already has ${existingFields.length} flow_fields records`);
      continue;
    }

    // Migrate fields
    if (config.fields && config.fields.length > 0) {
      for (let i = 0; i < config.fields.length; i++) {
        const f = config.fields[i];
        try {
          await db.insert(schema.flowFields).values({
            flowId: flow.id,
            fieldId: f.id,
            type: f.type,
            label: f.label,
            placeholder: f.placeholder ?? null,
            isRequired: f.required ?? false,
            options: f.options ?? [],
            sortOrder: i,
          });
          totalFieldsInserted++;
        } catch (err) {
          const msg = `Flow ${flow.id}: failed to insert field[${i}] "${f.label}": ${err}`;
          errors.push(msg);
          console.log(`  ERROR: ${msg}`);
        }
      }
      console.log(`  Fields inserted: ${config.fields.length}`);
    }

    // Migrate steps
    if (config.steps && config.steps.length > 0) {
      for (let i = 0; i < config.steps.length; i++) {
        const s = config.steps[i];
        try {
          await db.insert(schema.flowSteps).values({
            flowId: flow.id,
            stepId: s.id,
            skillId: s.skillId ?? null,
            skillVersion: s.skillVersion ?? null,
            model: s.model ?? '',
            provider: s.provider ?? '',
            prompt: s.prompt ?? '',
            capabilities: s.capabilities ?? [],
            inputMappings: s.inputMappings ?? {},
            overrides: s.overrides ?? {},
            editorConfig: s.editor ?? null,
            sortOrder: s.order ?? i,
          });
          totalStepsInserted++;
        } catch (err) {
          const msg = `Flow ${flow.id}: failed to insert step[${i}]: ${err}`;
          errors.push(msg);
          console.log(`  ERROR: ${msg}`);
        }
      }
      console.log(`  Steps inserted: ${config.steps.length}`);
    }

    // Update flow.style if present
    if (config.style) {
      await db
        .update(schema.flows)
        .set({ style: config.style })
        .where(eq(schema.flows.id, flow.id));
    }
  }

  // Verification
  console.log('\n=== VERIFICATION ===');

  for (const flow of flows) {
    const config = flow.config as FlowConfig;
    const fieldCount = await db.query.flowFields.findMany({
      where: eq(schema.flowFields.flowId, flow.id),
    });
    const stepCount = await db.query.flowSteps.findMany({
      where: eq(schema.flowSteps.flowId, flow.id),
    });

    const fieldsMatch = fieldCount.length === (config.fields?.length ?? 0);
    const stepsMatch = stepCount.length === (config.steps?.length ?? 0);

    console.log(
      `Flow "${flow.name}": fields ${fieldCount.length}/${config.fields?.length ?? 0} ${fieldsMatch ? '✓' : '✗'} | steps ${stepCount.length}/${config.steps?.length ?? 0} ${stepsMatch ? '✓' : '✗'}`,
    );

    if (!fieldsMatch)
      errors.push(
        `Flow ${flow.id}: field count mismatch ${fieldCount.length} vs ${config.fields?.length}`,
      );
    if (!stepsMatch)
      errors.push(
        `Flow ${flow.id}: step count mismatch ${stepCount.length} vs ${config.steps?.length}`,
      );
  }

  // Summary
  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Flows processed:  ${flows.length}`);
  console.log(`Fields inserted:  ${totalFieldsInserted}`);
  console.log(`Steps inserted:   ${totalStepsInserted}`);
  console.log(`Errors:           ${errors.length}`);

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
