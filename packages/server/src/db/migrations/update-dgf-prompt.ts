/**
 * Find and update the DGF/Paul Graham/Essays skill prompt
 * Run with: npx tsx packages/server/src/db/migrations/update-dgf-prompt.ts
 */

import { db, pool } from '../index.js';

async function findSkill() {
  const skills = await db.query.skills.findMany();
  // Search for DGF, essay, Paul Graham, or writer skills
  const matches = skills.filter(s =>
    s.name.toLowerCase().includes('dgf') ||
    s.name.toLowerCase().includes('paul graham') ||
    s.name.toLowerCase().includes('essay')
  );

  for (const s of matches) {
    process.stdout.write(`\nID: ${s.id}\n`);
    process.stdout.write(`Name: ${s.name}\n`);
    process.stdout.write(`Slug: ${s.slug}\n`);
    process.stdout.write(`Template: ${s.promptTemplate?.length ?? 0} chars\n`);
    process.stdout.write(`---TEMPLATE START---\n`);
    process.stdout.write((s.promptTemplate ?? 'NONE') + '\n');
    process.stdout.write(`---TEMPLATE END---\n`);
  }

  if (matches.length === 0) {
    // List all skill names
    process.stdout.write('No DGF/essay skills found. All skills:\n');
    for (const s of skills) {
      process.stdout.write(`  - ${s.name} (${s.slug})\n`);
    }
  }

  await pool.end();
}

findSkill().catch((err) => { console.error(err); process.exit(1); });
