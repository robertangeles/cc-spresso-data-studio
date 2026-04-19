/**
 * Standalone bootstrap script — run BEFORE `drizzle-kit push` the first time.
 *
 * Ensures pgvector is enabled so `drizzle-kit push` can create the
 * `data_model_embeddings.embedding vector(1024)` column without erroring.
 *
 * Usage:
 *   pnpm -C packages/server db:bootstrap
 *
 * Safe to run repeatedly — `CREATE EXTENSION IF NOT EXISTS` is idempotent.
 * Does NOT touch application tables; pure pg client, no drizzle schema import,
 * so it works even before the schema has been pushed.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

// Load repo-root .env — mirrors packages/server/src/config/index.ts.
// From packages/server/src/db/ensure-extensions.ts it is 4 levels up to
// the monorepo root where the real .env lives (lesson 2).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ensure-extensions] DATABASE_URL is not set. Check your .env.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[ensure-extensions] pgvector extension ensured ✓');
  } catch (err) {
    console.error('[ensure-extensions] Failed to enable pgvector:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
