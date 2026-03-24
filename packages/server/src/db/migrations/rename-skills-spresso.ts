/**
 * Rename skills: "Content Pilot" → "Spresso"
 * Run with: npx tsx packages/server/src/db/migrations/rename-skills-spresso.ts
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

async function rename() {
  const skills = await db.query.skills.findMany();
  const toRename = skills.filter((s) => s.name.includes('Content Pilot'));

  console.log(`Found ${toRename.length} skills with "Content Pilot" in name:\n`);

  for (const s of toRename) {
    const newName = s.name.replace('Content Pilot', 'Spresso');
    const newSlug = s.slug.replace('content-pilot', 'spresso');
    console.log(`  "${s.name}" → "${newName}"`);
    if (s.slug !== newSlug) console.log(`    slug: "${s.slug}" → "${newSlug}"`);

    await db.update(schema.skills)
      .set({ name: newName, slug: newSlug, updatedAt: new Date() })
      .where(eq(schema.skills.id, s.id));
  }

  console.log(`\nDone. ${toRename.length} skills renamed.`);
  await pool.end();
}

rename().catch((err) => { console.error(err); process.exit(1); });
