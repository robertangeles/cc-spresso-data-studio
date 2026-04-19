/**
 * One-off verification for Step 1 Model Studio scaffold.
 * Usage: pnpm -C packages/server tsx src/db/verify-step1.ts
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const expected = [
  'data_models',
  'data_model_entities',
  'data_model_layer_links',
  'data_model_attributes',
  'data_model_attribute_links',
  'data_model_relationships',
  'data_model_canvas_states',
  'data_model_semantic_mappings',
  'data_model_chat_logs',
  'data_model_embeddings',
  'data_model_embedding_jobs',
  'data_model_change_log',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('FAIL: DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const report: Record<string, unknown> = {};

  const t = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1)
     ORDER BY table_name`,
    [expected],
  );
  report.tables_found = t.rows.length;
  report.tables_expected = expected.length;
  report.tables_missing = expected.filter((x) => !t.rows.find((r) => r.table_name === x));

  const ext = await pool.query<{ extname: string; extversion: string }>(
    `SELECT extname, extversion FROM pg_extension WHERE extname='vector'`,
  );
  report.pgvector = ext.rows[0] || null;

  const idx = await pool.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname='public' AND tablename='data_model_embeddings'
     ORDER BY indexname`,
  );
  report.embeddings_indexes = idx.rows.map((r) => r.indexname);
  report.ivfflat_present = idx.rows.some(
    (r) => r.indexdef.toLowerCase().includes('ivfflat') || r.indexname.includes('ivfflat'),
  );

  const flag = await pool.query<{ key: string; value: string; is_secret: boolean }>(
    `SELECT key, value, is_secret FROM settings WHERE key='enable_model_studio'`,
  );
  report.flag_row = flag.rows[0] || null;

  const total = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text as c FROM pg_indexes
     WHERE schemaname='public' AND tablename LIKE 'data_model%'`,
  );
  report.total_data_model_indexes = total.rows[0]?.c;

  console.log(JSON.stringify(report, null, 2));

  const ok =
    (report.tables_missing as string[]).length === 0 &&
    report.pgvector !== null &&
    report.ivfflat_present === true &&
    report.flag_row !== null;
  console.log('\nRESULT:', ok ? 'OK ✓' : 'FAIL ✗');

  await pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log('ERR:', err?.message);
  process.exit(1);
});
