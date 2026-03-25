/**
 * Seed dim_models with current model pricing
 *
 * Run with: npx tsx packages/server/src/db/migrations/seed-dim-models.ts
 *
 * Pricing sources (as of March 2026):
 * - Anthropic: https://www.anthropic.com/pricing
 * - OpenRouter: https://openrouter.ai/models (pass-through pricing)
 */

import { db, pool, schema } from '../index.js';

interface ModelPricing {
  modelId: string;
  provider: string;
  displayName: string;
  inputCostPerM: number;  // $/1M input tokens
  outputCostPerM: number; // $/1M output tokens
}

const MODEL_PRICING: ModelPricing[] = [
  // --- Anthropic (direct) ---
  { modelId: 'claude-opus-4-6', provider: 'anthropic', displayName: 'Claude Opus 4.6', inputCostPerM: 15, outputCostPerM: 75 },
  { modelId: 'claude-sonnet-4-6', provider: 'anthropic', displayName: 'Claude Sonnet 4.6', inputCostPerM: 3, outputCostPerM: 15 },
  { modelId: 'claude-opus-4-5', provider: 'anthropic', displayName: 'Claude Opus 4.5', inputCostPerM: 15, outputCostPerM: 75 },
  { modelId: 'claude-sonnet-4-5', provider: 'anthropic', displayName: 'Claude Sonnet 4.5', inputCostPerM: 3, outputCostPerM: 15 },
  { modelId: 'claude-haiku-4-5', provider: 'anthropic', displayName: 'Claude Haiku 4.5', inputCostPerM: 0.8, outputCostPerM: 4 },

  // --- OpenRouter models ---
  // Anthropic via OpenRouter
  { modelId: 'anthropic/claude-sonnet-4', provider: 'openrouter', displayName: 'Claude Sonnet 4 (OR)', inputCostPerM: 3, outputCostPerM: 15 },
  { modelId: 'anthropic/claude-haiku-4', provider: 'openrouter', displayName: 'Claude Haiku 4 (OR)', inputCostPerM: 0.8, outputCostPerM: 4 },

  // Qwen
  { modelId: 'qwen/qwen-2.5-72b-instruct', provider: 'openrouter', displayName: 'Qwen 2.5 72B', inputCostPerM: 0.36, outputCostPerM: 0.36 },
  { modelId: 'qwen/qwen3-235b-a22b', provider: 'openrouter', displayName: 'Qwen 3 235B', inputCostPerM: 0.14, outputCostPerM: 0.14 },

  // DeepSeek
  { modelId: 'deepseek/deepseek-r1', provider: 'openrouter', displayName: 'DeepSeek R1', inputCostPerM: 0.55, outputCostPerM: 2.19 },
  { modelId: 'deepseek/deepseek-chat', provider: 'openrouter', displayName: 'DeepSeek Chat V3', inputCostPerM: 0.27, outputCostPerM: 1.10 },

  // Google Gemini
  { modelId: 'google/gemini-2.5-flash-preview', provider: 'openrouter', displayName: 'Gemini 2.5 Flash', inputCostPerM: 0.15, outputCostPerM: 0.60 },
  { modelId: 'google/gemini-2.5-pro-preview', provider: 'openrouter', displayName: 'Gemini 2.5 Pro', inputCostPerM: 1.25, outputCostPerM: 10 },
  { modelId: 'google/gemini-2.0-flash-001', provider: 'openrouter', displayName: 'Gemini 2.0 Flash', inputCostPerM: 0.10, outputCostPerM: 0.40 },
  { modelId: 'google/gemini-3.1-flash-lite-preview', provider: 'openrouter', displayName: 'Gemini 3.1 Flash Lite', inputCostPerM: 0.02, outputCostPerM: 0.08 },

  // Perplexity
  { modelId: 'perplexity/sonar-pro', provider: 'openrouter', displayName: 'Perplexity Sonar Pro', inputCostPerM: 3, outputCostPerM: 15 },
  { modelId: 'perplexity/sonar', provider: 'openrouter', displayName: 'Perplexity Sonar', inputCostPerM: 1, outputCostPerM: 1 },

  // Mistral
  { modelId: 'mistralai/mistral-large-2411', provider: 'openrouter', displayName: 'Mistral Large', inputCostPerM: 2, outputCostPerM: 6 },
  { modelId: 'mistralai/mistral-small-3.1-24b-instruct', provider: 'openrouter', displayName: 'Mistral Small 3.1', inputCostPerM: 0.10, outputCostPerM: 0.30 },

  // OpenAI
  { modelId: 'openai/gpt-4o', provider: 'openrouter', displayName: 'GPT-4o', inputCostPerM: 2.50, outputCostPerM: 10 },
  { modelId: 'openai/gpt-4o-mini', provider: 'openrouter', displayName: 'GPT-4o Mini', inputCostPerM: 0.15, outputCostPerM: 0.60 },
  { modelId: 'openai/gpt-5', provider: 'openrouter', displayName: 'GPT-5', inputCostPerM: 1.25, outputCostPerM: 10 },
  { modelId: 'openai/gpt-5-mini', provider: 'openrouter', displayName: 'GPT-5 Mini', inputCostPerM: 0.25, outputCostPerM: 2 },
  { modelId: 'openai/gpt-5.2', provider: 'openrouter', displayName: 'GPT-5.2', inputCostPerM: 1.25, outputCostPerM: 10 },
  { modelId: 'openai/gpt-5.4', provider: 'openrouter', displayName: 'GPT-5.4', inputCostPerM: 2.50, outputCostPerM: 15 },
];

async function seed() {
  console.log('=== SEED dim_models ===\n');

  let inserted = 0;
  let skipped = 0;

  for (const m of MODEL_PRICING) {
    // Check if already exists
    const existing = await db.query.dimModels.findFirst({
      where: (t, { eq }) => eq(t.modelId, m.modelId),
    });

    if (existing) {
      console.log(`  SKIP "${m.displayName}" (${m.modelId}) — already exists`);
      skipped++;
      continue;
    }

    await db.insert(schema.dimModels).values({
      modelId: m.modelId,
      provider: m.provider,
      displayName: m.displayName,
      inputCostPerM: m.inputCostPerM,
      outputCostPerM: m.outputCostPerM,
    });
    inserted++;
    console.log(`  ✓ "${m.displayName}" — $${m.inputCostPerM}/$${m.outputCostPerM} per M tokens`);
  }

  console.log(`\n=== SUMMARY: ${inserted} inserted, ${skipped} skipped ===`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed crashed:', err);
  process.exit(1);
});
