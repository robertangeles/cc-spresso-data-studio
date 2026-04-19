/**
 * Link a project to a client by (fuzzy-match) names, scoped to an org.
 *
 * Usage:
 *   pnpm -C packages/server tsx src/db/link-project-to-client.ts \
 *     "<project name or LIKE pattern>" "<client name or LIKE pattern>" "<org name or LIKE pattern>"
 *
 * Example:
 *   pnpm -C packages/server tsx src/db/link-project-to-client.ts \
 *     "Acme Corp Data Warehouse" "Just another Client" "Archos AI and Data"
 *
 * Safe + idempotent: if the client is already linked, it re-states and exits 0.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main() {
  const [
    projectPat = 'Acme Corp Data Warehouse',
    clientPat = 'Just another Client',
    orgPat = 'Archos AI and Data',
  ] = process.argv.slice(2);
  const url = process.env.DATABASE_URL!;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const { rows: orgs } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM organisations WHERE name ILIKE $1 LIMIT 1`,
      [`%${orgPat}%`],
    );
    if (orgs.length === 0) throw new Error(`No org matching "${orgPat}"`);
    const org = orgs[0];
    console.log(`Org: ${org.name} (${org.id})`);

    const { rows: clients } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE organisation_id = $1 AND name ILIKE $2 LIMIT 1`,
      [org.id, `%${clientPat}%`],
    );
    if (clients.length === 0)
      throw new Error(`No client matching "${clientPat}" in org "${org.name}"`);
    const client = clients[0];
    console.log(`Client: ${client.name} (${client.id})`);

    const { rows: projects } = await pool.query<{
      id: string;
      name: string;
      client_id: string | null;
    }>(
      `SELECT id, name, client_id FROM projects
        WHERE organisation_id = $1 AND name ILIKE $2
        ORDER BY updated_at DESC LIMIT 1`,
      [org.id, `%${projectPat}%`],
    );
    if (projects.length === 0)
      throw new Error(`No project matching "${projectPat}" in org "${org.name}"`);
    const project = projects[0];
    console.log(
      `Project: ${project.name} (${project.id}) — current client_id=${project.client_id}`,
    );

    if (project.client_id === client.id) {
      console.log('Already linked. No update.');
    } else {
      await pool.query(`UPDATE projects SET client_id = $1, updated_at = NOW() WHERE id = $2`, [
        client.id,
        project.id,
      ]);
      console.log(`✓ Linked project → client.`);
    }

    const { rows: final } = await pool.query<{ project: string; client: string; org: string }>(
      `SELECT p.name AS project, c.name AS client, o.name AS org
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN organisations o ON o.id = p.organisation_id
        WHERE p.id = $1`,
      [project.id],
    );
    const f = final[0];
    console.log(`\n✓ Hierarchy:`);
    console.log(`  Organisation: ${f.org}`);
    console.log(`  Client:       ${f.client ?? '(none)'}`);
    console.log(`  Project:      ${f.project}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
