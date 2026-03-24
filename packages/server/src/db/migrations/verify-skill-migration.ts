import { db, pool } from '../index.js';

async function verify() {
  const inputs = await db.query.skillInputs.findMany();
  const outputs = await db.query.skillOutputs.findMany();
  const skills = await db.query.skills.findMany();
  const withTemplate = skills.filter((s) => s.promptTemplate);

  process.stdout.write(`\n\n===VERIFY===\n`);
  process.stdout.write(`skill_inputs: ${inputs.length}\n`);
  process.stdout.write(`skill_outputs: ${outputs.length}\n`);
  process.stdout.write(`skills with promptTemplate: ${withTemplate.length}/${skills.length}\n`);
  process.stdout.write(`===END===\n`);

  await pool.end();
}

verify().catch((e) => { console.error(e); process.exit(1); });
