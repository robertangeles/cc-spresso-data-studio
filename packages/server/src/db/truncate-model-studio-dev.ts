/**
 * Dev-only: truncate all Model Studio data tables before a schema
 * migration that alters / drops a NOT NULL column. Safe because
 * Step 1/2 only contain test data — no real user models yet.
 *
 * Usage: pnpm -C packages/server tsx src/db/truncate-model-studio-dev.ts
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const tables = [
    'data_model_change_log',
    'data_model_embedding_jobs',
    'data_model_embeddings',
    'data_model_chat_logs',
    'data_model_semantic_mappings',
    'data_model_canvas_states',
    'data_model_relationships',
    'data_model_attribute_links',
    'data_model_attributes',
    'data_model_layer_links',
    'data_model_entities',
    'data_models',
  ];

  const client = await pool.connect();
  try {
    for (const t of tables) {
      const before = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${t}`);
      console.log(`${t}: ${before.rows[0].c} rows`);
    }
    await client.query(`TRUNCATE ${tables.join(', ')} CASCADE`);
    console.log('TRUNCATE OK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
