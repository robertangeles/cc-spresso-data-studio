/**
 * One-off manual migration: swap data_models.organisation_id for
 * data_models.project_id after CEO-mode decision to scope models by
 * project (not just org).
 *
 * Safe because data_models was truncated beforehand. After this runs,
 * drizzle-kit push will see schema.ts and the DB agree.
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
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const statements = [
    // Drop old unique + index on organisation_id scope
    `DROP INDEX IF EXISTS idx_data_models_unique_name`,
    `DROP INDEX IF EXISTS idx_data_models_organisation_id`,

    // Drop the column (and its FK). Table is empty; safe.
    `ALTER TABLE data_models DROP COLUMN IF EXISTS organisation_id`,

    // Add project_id (NOT NULL ok because the table is empty)
    `ALTER TABLE data_models ADD COLUMN IF NOT EXISTS project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE`,

    // New indexes matching schema.ts
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_data_models_unique_name ON data_models (project_id, owner_id, name)`,
    `CREATE INDEX IF NOT EXISTS idx_data_models_project_id ON data_models (project_id)`,
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of statements) {
      console.log('>>>', sql);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log('\nOK — data_models is now project-scoped.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('FAILED:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
