/**
 * Remove DGF-specific rules from global Rules Engine
 * Run with: npx tsx packages/server/src/db/migrations/remove-dgf-rules.ts
 */

import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../index.js';

const TO_REMOVE = [
  'Specifics Earn Their Place',
  'Questions as Structural Devices',
  'Process Through People',
];

async function remove() {
  for (const name of TO_REMOVE) {
    const rule = await db.query.userRules.findFirst({
      where: eq(schema.userRules.name, name),
    });
    if (rule) {
      await db.delete(schema.userRules).where(eq(schema.userRules.id, rule.id));
      console.log(`✓ Removed "${name}"`);
    } else {
      console.log(`SKIP "${name}" — not found`);
    }
  }
  console.log('Done. Add these to the DGF writer skill prompt instead.');
  await pool.end();
}

remove().catch((err) => { console.error(err); process.exit(1); });
