/**
 * One-time migration: Skill Marketplace
 * - Adds new columns to skills table
 * - Creates skill_favorites table
 * - Backfills visibility from is_published
 * - Drops old unique constraint, adds new composite unique
 *
 * Run: npx tsx src/db/migrate-marketplace.ts
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cc_content_builder';

async function migrate() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');

    // 1. Add new columns to skills table (IF NOT EXISTS for idempotency)
    const addColumns = [
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS show_prompts BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS forked_from_id UUID`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS fork_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS creator_display_name VARCHAR(255)`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS creator_avatar_url VARCHAR(500)`,
    ];

    for (const sql of addColumns) {
      await client.query(sql);
      console.log(`  ✓ ${sql.slice(0, 70)}...`);
    }

    // 2. Backfill visibility from is_published
    const backfill = await client.query(`
      UPDATE skills
      SET visibility = CASE
        WHEN is_published = true THEN 'public'
        ELSE 'private'
      END
      WHERE visibility = 'private' AND is_published = true
    `);
    console.log(`  ✓ Backfilled visibility for ${backfill.rowCount} skills`);

    // 3. Backfill creator_display_name from users table
    const creatorBackfill = await client.query(`
      UPDATE skills s
      SET creator_display_name = u.name
      FROM users u
      WHERE s.user_id = u.id
        AND s.creator_display_name IS NULL
    `);
    console.log(`  ✓ Backfilled creator names for ${creatorBackfill.rowCount} skills`);

    // 4. Create skill_favorites table
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_favorites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✓ Created skill_favorites table');

    // 5. Create indexes (IF NOT EXISTS)
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_skills_visibility ON skills (visibility)`,
      `CREATE INDEX IF NOT EXISTS idx_skills_usage_count ON skills (usage_count)`,
      `CREATE INDEX IF NOT EXISTS idx_skills_forked_from ON skills (forked_from_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_favorites_user_skill ON skill_favorites (user_id, skill_id)`,
      `CREATE INDEX IF NOT EXISTS idx_skill_favorites_skill_id ON skill_favorites (skill_id)`,
    ];

    for (const sql of indexes) {
      await client.query(sql);
      console.log(`  ✓ ${sql.slice(0, 70)}...`);
    }

    // 6. Update slug uniqueness: drop old global unique, add composite (user_id, slug)
    // First check if old constraint exists
    const oldConstraint = await client.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'skills' AND constraint_type = 'UNIQUE'
        AND constraint_name = 'skills_slug_unique'
    `);
    if (oldConstraint.rowCount && oldConstraint.rowCount > 0) {
      await client.query(`ALTER TABLE skills DROP CONSTRAINT skills_slug_unique`);
      console.log('  ✓ Dropped old global slug unique constraint');
    }

    // Add composite unique (idempotent — check first)
    const newConstraint = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'skills' AND indexname = 'idx_skills_user_slug'
    `);
    if (!newConstraint.rowCount || newConstraint.rowCount === 0) {
      await client.query(`CREATE UNIQUE INDEX idx_skills_user_slug ON skills (user_id, slug)`);
      console.log('  ✓ Created composite unique index (user_id, slug)');
    } else {
      console.log('  ✓ Composite unique index already exists');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
