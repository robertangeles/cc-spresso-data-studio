/**
 * Idempotent seed for the end-to-end test account.
 *
 * Creates (or resets) a deterministic Administrator user + organisation
 * that Playwright tests use to log in.
 *
 * Usage:
 *   pnpm -C packages/server db:seed-e2e
 *
 * Credentials (matching tests/e2e/auth.setup.ts):
 *   email:    e2e-test@test.com
 *   password: e2e-test-password-123
 *   role:     Administrator
 *   org:      "E2E Test Org" (owned by the user)
 *
 * Re-runnable: if the user already exists we re-hash the password,
 * verify the email, and promote to Administrator. The org is created
 * once and then left alone.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { and, eq } from 'drizzle-orm';
import { db, pool } from './index.js';
import { users, organisations, organisationMembers, projects } from './schema.js';
import { hashPassword } from '../utils/password.js';

export const E2E_USER_EMAIL = 'e2e-test@test.com';
export const E2E_USER_PASSWORD = 'e2e-test-password-123';
const E2E_USER_NAME = 'E2E Test User';
const E2E_ORG_NAME = 'E2E Test Org';
const E2E_ORG_SLUG = 'e2e-test-org';
const E2E_PROJECT_NAME = 'E2E Test Project';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[seed-e2e-user] DATABASE_URL not set');
    process.exit(1);
  }

  const passwordHash = await hashPassword(E2E_USER_PASSWORD);

  // 1. User — upsert
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, E2E_USER_EMAIL))
    .limit(1);

  let userId: string;
  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'Administrator',
        isEmailVerified: true,
        isBlocked: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    userId = existing.id;
    console.log(`[seed-e2e-user] User reset: ${E2E_USER_EMAIL} (id=${userId})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: E2E_USER_EMAIL,
        passwordHash,
        name: E2E_USER_NAME,
        role: 'Administrator',
        isEmailVerified: true,
      })
      .returning({ id: users.id });
    userId = created.id;
    console.log(`[seed-e2e-user] User created: ${E2E_USER_EMAIL} (id=${userId})`);
  }

  // 2. Organisation — upsert
  const [existingOrg] = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(eq(organisations.slug, E2E_ORG_SLUG))
    .limit(1);

  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`[seed-e2e-user] Org reused: ${E2E_ORG_NAME} (id=${orgId})`);
  } else {
    const [created] = await db
      .insert(organisations)
      .values({
        name: E2E_ORG_NAME,
        slug: E2E_ORG_SLUG,
        joinKey: `E2E-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        ownerId: userId,
      })
      .returning({ id: organisations.id });
    orgId = created.id;
    console.log(`[seed-e2e-user] Org created: ${E2E_ORG_NAME} (id=${orgId})`);
  }

  // 3. Membership — ensure owner role
  const [membership] = await db
    .select({ id: organisationMembers.id })
    .from(organisationMembers)
    .where(eq(organisationMembers.userId, userId))
    .limit(1);

  if (!membership) {
    await db.insert(organisationMembers).values({
      organisationId: orgId,
      userId,
      role: 'owner',
    });
    console.log('[seed-e2e-user] Membership created (owner)');
  } else {
    console.log('[seed-e2e-user] Membership already present');
  }

  // 4. Project — upsert (needed because models now belong to a project)
  const [existingProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.name, E2E_PROJECT_NAME), eq(projects.userId, userId)))
    .limit(1);

  let projectId: string;
  if (existingProject) {
    projectId = existingProject.id;
    console.log(`[seed-e2e-user] Project reused: ${E2E_PROJECT_NAME} (id=${projectId})`);
  } else {
    const [created] = await db
      .insert(projects)
      .values({
        userId,
        organisationId: orgId,
        name: E2E_PROJECT_NAME,
        description: 'Playwright E2E fixture — do not remove unless tests are also cleaned up.',
      })
      .returning({ id: projects.id });
    projectId = created.id;
    console.log(`[seed-e2e-user] Project created: ${E2E_PROJECT_NAME} (id=${projectId})`);
  }

  console.log('\n[seed-e2e-user] Done ✓');
  console.log(`  email:     ${E2E_USER_EMAIL}`);
  console.log(`  password:  ${E2E_USER_PASSWORD}`);
  console.log(`  userId:    ${userId}`);
  console.log(`  orgId:     ${orgId}`);
  console.log(`  projectId: ${projectId}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed-e2e-user] FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
