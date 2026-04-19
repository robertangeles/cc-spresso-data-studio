/**
 * One-off reconciliation: ensure the existing "Acme Corp Data Warehouse"
 * project is linked to the current user's organisation (and, if an
 * "Acme Corp" client exists in that org, linked to that too).
 *
 * Establishes the full hierarchy: Organisation → Client → Project → Model.
 *
 * Idempotent. Reports the final state. Safe to run repeatedly.
 *
 * Usage:
 *   pnpm -C packages/server tsx src/db/reconcile-acme-project.ts [user_email]
 *
 * Default email: trebor.selegna@outlook.com (Rob's account, per memory).
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const PROJECT_NAME_LIKE = '%Acme Corp Data Warehouse%';
const CLIENT_NAME_LIKE = '%Acme%';
const DEFAULT_EMAIL = 'trebor.selegna@outlook.com';

async function main() {
  const email = process.argv[2] || DEFAULT_EMAIL;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // 1. Resolve the user
    const { rows: userRows } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    if (userRows.length === 0) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }
    const user = userRows[0];
    console.log(`User: ${user.name} (${user.id})`);

    // 2. Find the user's organisations — prefer ones they own, then any membership
    const { rows: orgs } = await pool.query<{ id: string; name: string; role: string | null }>(
      `SELECT o.id, o.name, om.role
         FROM organisations o
         LEFT JOIN organisation_members om
           ON om.organisation_id = o.id AND om.user_id = $1
        WHERE o.owner_id = $1 OR om.user_id = $1
        ORDER BY (o.owner_id = $1) DESC, o.created_at ASC`,
      [user.id],
    );
    if (orgs.length === 0) {
      console.error(`User ${email} has no organisations — cannot proceed.`);
      process.exit(1);
    }
    const primaryOrg = orgs[0];
    console.log(`Orgs: ${orgs.length}. Using primary: "${primaryOrg.name}" (${primaryOrg.id})`);

    // 3. Find the Acme project — prefer one owned by the user; else any match
    const { rows: projectRows } = await pool.query<{
      id: string;
      name: string;
      user_id: string;
      organisation_id: string | null;
      client_id: string | null;
    }>(
      `SELECT id, name, user_id, organisation_id, client_id
         FROM projects
        WHERE name ILIKE $1
        ORDER BY (user_id = $2) DESC, updated_at DESC
        LIMIT 5`,
      [PROJECT_NAME_LIKE, user.id],
    );
    if (projectRows.length === 0) {
      console.error(`No project matching name LIKE '${PROJECT_NAME_LIKE}' found.`);
      process.exit(1);
    }
    const project = projectRows[0];
    console.log(`Project: "${project.name}" (${project.id})`);
    console.log(
      `  before → organisation_id=${project.organisation_id} client_id=${project.client_id}`,
    );

    // 4. Find (or leave null) an Acme client in the primary org
    const { rows: clientRows } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM clients
        WHERE organisation_id = $1 AND name ILIKE $2
        ORDER BY created_at ASC LIMIT 1`,
      [primaryOrg.id, CLIENT_NAME_LIKE],
    );
    const clientId = clientRows[0]?.id ?? null;
    if (clientId) {
      console.log(`Client: "${clientRows[0].name}" (${clientId}) — linking project.`);
    } else {
      console.log(`No "Acme" client found in org "${primaryOrg.name}". Leaving client_id as-is.`);
    }

    // 5. Patch the project in a single UPDATE if anything needs to change
    const wantOrg = primaryOrg.id;
    const wantClient = clientId ?? project.client_id; // prefer linking to found client, else keep
    if (project.organisation_id === wantOrg && project.client_id === wantClient) {
      console.log('Project already reconciled. No update needed.');
    } else {
      await pool.query(
        `UPDATE projects SET organisation_id = $1, client_id = $2, updated_at = NOW() WHERE id = $3`,
        [wantOrg, wantClient, project.id],
      );
      console.log(`Project updated → organisation_id=${wantOrg} client_id=${wantClient}`);
    }

    // 6. Print final state
    const { rows: finalRows } = await pool.query<{
      name: string;
      org_name: string | null;
      client_name: string | null;
    }>(
      `SELECT p.name, o.name AS org_name, c.name AS client_name
         FROM projects p
         LEFT JOIN organisations o ON o.id = p.organisation_id
         LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = $1`,
      [project.id],
    );
    const f = finalRows[0];
    console.log(`\n✓ Hierarchy:`);
    console.log(`  Organisation: ${f.org_name ?? '(none)'}`);
    console.log(`  Client:       ${f.client_name ?? '(none)'}`);
    console.log(`  Project:      ${f.name}`);
    console.log(`  Model Studio is now ready to create models under this project.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
