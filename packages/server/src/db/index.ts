import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

pool.on('connect', () => {
  logger.info('Database pool connected');
});

// Verify DB connectivity on startup with retry
export async function verifyConnection(retries = 3, delay = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Database connection verified');
      return;
    } catch (err) {
      logger.warn({ err, attempt, retries }, 'Database connection attempt failed');
      if (attempt === retries) {
        throw new Error(`Database connection failed after ${retries} attempts`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export const db = drizzle(pool, { schema, logger: config.isDev });
export { pool, schema };

// ============================================================
// Model Studio bootstrap — idempotent setup that runs on every
// server start. Safe to call repeatedly.
//
// Steps:
//   1. CREATE EXTENSION IF NOT EXISTS vector (pgvector for RAG)
//   2. Create ivfflat index on data_model_embeddings if the table
//      exists and the index does not (drizzle cannot express ivfflat).
//   3. Seed the `enable_model_studio` feature flag as 'false' if
//      no row exists yet (admin can toggle ON via Site Settings).
//
// First-time setup note: pgvector extension MUST exist before
// `drizzle-kit push` runs (the schema declares vector(1024) columns).
// If this is the very first push, run the server once first to
// enable the extension, OR manually run:
//   CREATE EXTENSION IF NOT EXISTS vector;
// in your Postgres instance before pushing.
// ============================================================

export const MODEL_STUDIO_FLAG_KEY = 'enable_model_studio';

export async function ensureModelStudioBootstrap(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. pgvector extension — idempotent
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // 2. ivfflat index (only if table exists — avoids error on first push)
    const tableCheck = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'data_model_embeddings'
       ) AS exists`,
    );
    if (tableCheck.rows[0]?.exists) {
      // lists = 100 is reasonable for up to ~10k rows; retune at scale.
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_data_model_embeddings_ivfflat
           ON data_model_embeddings
           USING ivfflat (embedding vector_cosine_ops)
           WITH (lists = 100)`,
      );
    }

    // 3. Seed the feature flag (default OFF)
    const settingsCheck = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'settings'
       ) AS exists`,
    );
    if (settingsCheck.rows[0]?.exists) {
      await client.query(
        `INSERT INTO settings (key, value, is_secret)
           VALUES ($1, 'false', false)
           ON CONFLICT (key) DO NOTHING`,
        [MODEL_STUDIO_FLAG_KEY],
      );
    }

    logger.info('Model Studio bootstrap completed');
  } catch (err) {
    // Do NOT fail server startup on bootstrap error — log loudly and move on.
    // The extension or index may be restricted in some environments; surface
    // the failure so it can be fixed, but don't block the whole app.
    logger.error({ err }, 'Model Studio bootstrap failed — feature may not work until resolved');
  } finally {
    client.release();
  }
}
