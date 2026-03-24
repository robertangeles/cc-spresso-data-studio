/**
 * Add Kimi K2, GLM-5, Qwen3-14B to dim_models
 * Run with: npx tsx packages/server/src/db/migrations/add-models-kimi-glm-qwen.ts
 */

import { db, pool, schema } from '../index.js';

const NEW_MODELS = [
  { modelId: 'moonshotai/kimi-k2', provider: 'openrouter', displayName: 'Kimi K2', inputCostPerM: 0.60, outputCostPerM: 2.50 },
  { modelId: 'zhipu/glm-5-0131', provider: 'openrouter', displayName: 'GLM-5', inputCostPerM: 0.28, outputCostPerM: 0.28 },
  { modelId: 'qwen/qwen3-14b', provider: 'openrouter', displayName: 'Qwen 3 14B', inputCostPerM: 0.07, outputCostPerM: 0.14 },
];

async function seed() {
  for (const m of NEW_MODELS) {
    const existing = await db.query.dimModels.findFirst({
      where: (t, { eq }) => eq(t.modelId, m.modelId),
    });
    if (existing) {
      console.log(`SKIP "${m.displayName}" — already exists`);
      continue;
    }
    await db.insert(schema.dimModels).values(m);
    console.log(`✓ "${m.displayName}" ($${m.inputCostPerM}/$${m.outputCostPerM} per M tokens)`);
  }
  console.log('Done.');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
