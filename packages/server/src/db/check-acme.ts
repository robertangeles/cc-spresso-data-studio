import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main() {
  const url = process.env.DATABASE_URL!;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  const p = await pool.query(`
    SELECT p.id, p.name, p.client_id, c.name AS client_name, o.name AS org_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN organisations o ON o.id = p.organisation_id
    WHERE p.name ILIKE '%Acme Corp Data Warehouse%'`);
  console.log('PROJECT:', JSON.stringify(p.rows, null, 2));
  const m = await pool.query(`
    SELECT dm.id, dm.name AS model_name, p.name AS project_name, c.name AS client_name
    FROM data_models dm
    JOIN projects p ON p.id = dm.project_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE lower(p.name) LIKE '%acme corp data warehouse%'`);
  console.log('MODELS:', JSON.stringify(m.rows, null, 2));
  await pool.end();
}
main();
