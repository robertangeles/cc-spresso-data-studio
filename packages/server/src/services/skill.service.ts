import { eq, and, ilike, or, desc } from 'drizzle-orm';
import type { SkillConfig } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';

interface ListSkillsOptions {
  category?: string;
  source?: string;
  search?: string;
  userId?: string;
}

export async function listSkills(options: ListSkillsOptions = {}) {
  const conditions = [];

  if (options.category) {
    conditions.push(eq(schema.skills.category, options.category));
  }
  if (options.source) {
    conditions.push(eq(schema.skills.source, options.source));
  }
  if (options.search) {
    conditions.push(
      or(
        ilike(schema.skills.name, `%${options.search}%`),
        ilike(schema.skills.description, `%${options.search}%`),
      ),
    );
  }

  // Show published skills + user's own unpublished skills
  if (options.userId) {
    conditions.push(
      or(
        eq(schema.skills.isPublished, true),
        eq(schema.skills.userId, options.userId),
      ),
    );
  } else {
    conditions.push(eq(schema.skills.isPublished, true));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.query.skills.findMany({
    where,
    orderBy: [desc(schema.skills.source), schema.skills.name],
  });
}

export async function getSkillByIdOrSlug(idOrSlug: string) {
  // Try UUID first, then slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const skill = isUuid
    ? await db.query.skills.findFirst({ where: eq(schema.skills.id, idOrSlug) })
    : await db.query.skills.findFirst({ where: eq(schema.skills.slug, idOrSlug) });

  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  return skill;
}

export async function getSkillVersion(skillId: string, version: number) {
  const sv = await db.query.skillVersions.findFirst({
    where: and(
      eq(schema.skillVersions.skillId, skillId),
      eq(schema.skillVersions.version, version),
    ),
  });

  if (!sv) {
    throw new NotFoundError('Skill version not found');
  }

  return sv;
}

export async function listSkillVersions(skillId: string) {
  return db.query.skillVersions.findMany({
    where: eq(schema.skillVersions.skillId, skillId),
    orderBy: [desc(schema.skillVersions.version)],
  });
}

interface CreateSkillData {
  name: string;
  slug: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
  config: SkillConfig;
}

export async function createSkill(data: CreateSkillData, userId: string) {
  // Check slug uniqueness
  const existing = await db.query.skills.findFirst({
    where: eq(schema.skills.slug, data.slug),
  });

  if (existing) {
    throw new ConflictError('A skill with this slug already exists');
  }

  const [skill] = await db
    .insert(schema.skills)
    .values({
      slug: data.slug,
      name: data.name,
      description: data.description,
      category: data.category,
      source: 'user',
      userId,
      icon: data.icon,
      tags: data.tags ?? [],
      config: data.config,
      isPublished: true,
    })
    .returning();

  // Create initial version
  await db.insert(schema.skillVersions).values({
    skillId: skill.id,
    version: 1,
    config: data.config,
    changelog: 'Initial version',
  });

  return skill;
}

interface UpdateSkillData {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  config?: SkillConfig;
  isPublished?: boolean;
  changelog?: string;
}

export async function updateSkill(skillId: string, data: UpdateSkillData, userId: string) {
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });

  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  // Check user role for authorization
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  const isAdmin = user?.role === 'Administrator';

  // Only admins can edit built-in skills
  if (skill.source === 'builtin' && !isAdmin) {
    throw new ForbiddenError('Only administrators can modify built-in skills');
  }

  // Admins can edit any skill; others can only edit their own
  if (!isAdmin && skill.userId !== userId) {
    throw new ForbiddenError('You can only edit your own skills');
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.icon !== undefined) updates.icon = data.icon;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.isPublished !== undefined) updates.isPublished = data.isPublished;

  // If config changed, create a new version
  if (data.config) {
    const newVersion = skill.currentVersion + 1;
    updates.config = data.config;
    updates.currentVersion = newVersion;

    await db.insert(schema.skillVersions).values({
      skillId: skill.id,
      version: newVersion,
      config: data.config,
      changelog: data.changelog ?? `Version ${newVersion}`,
    });
  }

  const [updated] = await db
    .update(schema.skills)
    .set(updates)
    .where(eq(schema.skills.id, skillId))
    .returning();

  return updated;
}

export async function deleteSkill(skillId: string, userId: string) {
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });

  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  const isAdmin = user?.role === 'Administrator';

  if (skill.source === 'builtin' && !isAdmin) {
    throw new ForbiddenError('Only administrators can delete built-in skills');
  }

  if (!isAdmin && skill.userId !== userId) {
    throw new ForbiddenError('You can only delete your own skills');
  }

  await db.delete(schema.skills).where(eq(schema.skills.id, skillId));
}
