import { db, pool } from '../index.js';

async function readRules() {
  const rules = await db.query.userRules.findMany();
  for (const r of rules) {
    process.stdout.write(`\n=== ${r.name} (active=${r.isActive}) ===\n`);
    process.stdout.write(r.rules + '\n');
  }
  process.stdout.write(`\nTotal: ${rules.length} rules\n`);
  await pool.end();
}

readRules().catch((e) => { console.error(e); process.exit(1); });
