/**
 * Migration: execution_logs.skill_name → skill_id, provider → provider_id
 *
 * Run with: npx tsx packages/server/src/db/migrations/migrate-execution-logs.ts
 *
 * This script:
 * 1. Reads all execution_logs with skill_name set
 * 2. Looks up skills.id by name match
 * 3. Sets skill_id FK on each log row
 * 4. Provider is always null in current data — skipped
 * 5. Verifies counts
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

async function migrate() {
  console.log('=== EXECUTION LOGS FK MIGRATION ===\n');

  // Load skill name→id map
  const skills = await db.query.skills.findMany();
  const skillMap = new Map<string, string>();
  for (const s of skills) {
    skillMap.set(s.name.toLowerCase(), s.id);
  }
  console.log(`Loaded ${skills.length} skills for name→id lookup\n`);

  // Get logs that need migration (have skill_name but no skill_id)
  const logs = await db.query.executionLogs.findMany();
  const needsMigration = logs.filter((l) => l.skillName && !l.skillId);
  console.log(`Total logs: ${logs.length}, needing skill_id: ${needsMigration.length}\n`);

  let updated = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const log of needsMigration) {
    const skillId = skillMap.get(log.skillName!.toLowerCase());
    if (!skillId) {
      notFound++;
      console.log(`  SKIP log ${log.id}: skill "${log.skillName}" not found in skills table`);
      continue;
    }

    try {
      await db
        .update(schema.executionLogs)
        .set({ skillId })
        .where(eq(schema.executionLogs.id, log.id));
      updated++;
    } catch (err) {
      errors.push(`Log ${log.id}: ${err}`);
    }
  }

  // Summary
  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Total logs:       ${logs.length}`);
  console.log(`Needed migration: ${needsMigration.length}`);
  console.log(`Updated:          ${updated}`);
  console.log(`Skill not found:  ${notFound}`);
  console.log(`Errors:           ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
  }

  // Verification
  const afterLogs = await db.query.executionLogs.findMany();
  const withSkillId = afterLogs.filter((l) => l.skillId);
  const withSkillName = afterLogs.filter((l) => l.skillName);
  console.log(
    `\nVerification: ${withSkillId.length}/${withSkillName.length} logs have skill_id set`,
  );

  console.log(errors.length > 0 ? '\nMIGRATION: COMPLETED WITH ERRORS' : '\nMIGRATION: SUCCESS');

  await pool.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

migrate().catch((err) => {
  console.error('Migration crashed:', err);
  process.exit(1);
});
