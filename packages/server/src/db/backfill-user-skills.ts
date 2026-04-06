/**
 * One-time backfill: seed default Anthropic skills for a specific user.
 * Usage: npx tsx src/db/backfill-user-skills.ts <email>
 */
import { db, schema } from './index.js';
import { eq } from 'drizzle-orm';
import { seedDefaultSkillsForUser } from '../services/skills/seed-user-defaults.js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/db/backfill-user-skills.ts <email>');
    process.exit(1);
  }

  console.log(`Looking up user: ${email}`);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
    columns: { id: true, email: true, name: true },
  });

  if (!user) {
    console.error(`User not found: ${email}`);
    // List all users for reference
    const all = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users);
    console.log('\nAvailable users:');
    for (const u of all) console.log(`  ${u.email} — ${u.name}`);
    process.exit(1);
  }

  console.log(`Found: ${user.name} (${user.id})`);
  await seedDefaultSkillsForUser(user.id);
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
