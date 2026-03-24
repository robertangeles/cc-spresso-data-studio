/**
 * Test: Run usage aggregation on existing execution_logs
 * Run with: npx tsx packages/server/src/db/migrations/test-aggregation.ts
 */

import { pool } from '../index.js';
import { aggregate, getSummary, getByModel } from '../../services/usage.service.js';

async function test() {
  console.log('=== TEST USAGE AGGREGATION ===\n');

  const result = await aggregate();
  console.log(`Logs processed: ${result.rowsProcessed}`);
  console.log(`Fact rows upserted: ${result.factRowsUpserted}\n`);

  const summary = await getSummary();
  console.log('=== SUMMARY ===');
  console.log(`Total input tokens:  ${summary.totalInputTokens.toLocaleString()}`);
  console.log(`Total output tokens: ${summary.totalOutputTokens.toLocaleString()}`);
  console.log(`Total cost:          $${summary.totalCost.toFixed(4)}`);
  console.log(`Request count:       ${summary.requestCount}`);
  console.log(`Avg duration:        ${summary.avgDurationMs}ms\n`);

  const byModel = await getByModel();
  console.log('=== BY MODEL ===');
  for (const m of byModel) {
    console.log(`  ${m.displayName}: $${m.totalCost.toFixed(4)} (${m.percentage}%) — ${m.requestCount} reqs`);
  }

  console.log('\n=== TEST PASSED ===');
  await pool.end();
}

test().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
