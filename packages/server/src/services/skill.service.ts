import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import type { SkillConfig, SkillVisibility } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors.js';

// ============================================================
// HELPERS
// ============================================================

async function assertSkillOwnership(skillId: string, userId: string) {
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });
  if (!skill) throw new NotFoundError('Skill not found');

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  const isAdmin = user?.role === 'Administrator';

  if (skill.source === 'builtin' && !isAdmin) {
    throw new ForbiddenError('Only administrators can modify built-in skills');
  }
  if (!isAdmin && skill.userId !== userId) {
    throw new ForbiddenError('You can only modify your own skills');
  }

  return { skill, user, isAdmin };
}

/**
 * Redact prompts from a skill if the requesting user is not the owner
 * and the creator has not enabled showPrompts.
 */
function redactPrompts(
  skill: typeof schema.skills.$inferSelect,
  requestingUserId?: string,
  isAdmin?: boolean,
): typeof schema.skills.$inferSelect {
  const isOwner = requestingUserId && skill.userId === requestingUserId;
  if (isOwner || isAdmin || skill.showPrompts) return skill;
  return {
    ...skill,
    promptTemplate: null,
    systemPrompt: null,
    config: {
      ...(skill.config as Record<string, unknown>),
      promptTemplate: '[hidden]',
      systemPrompt: undefined,
    },
  } as typeof schema.skills.$inferSelect;
}

// ============================================================
// LIST — MY WORKSHOP
// ============================================================

interface ListMySkillsOptions {
  category?: string;
  search?: string;
  userId: string;
}

export async function listMySkills(options: ListMySkillsOptions) {
  const conditions = [eq(schema.skills.userId, options.userId)];

  if (options.category) {
    conditions.push(eq(schema.skills.category, options.category));
  }
  if (options.search) {
    conditions.push(
      or(
        ilike(schema.skills.name, `%${options.search}%`),
        ilike(schema.skills.description, `%${options.search}%`),
      )!,
    );
  }

  return db.query.skills.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.skills.updatedAt)],
  });
}

// ============================================================
// LIST — COMMUNITY
// ============================================================

interface ListCommunitySkillsOptions {
  category?: string;
  search?: string;
  sort?: 'popular' | 'newest';
  creatorId?: string;
  limit?: number;
  cursor?: string;
  userId?: string;
}

export async function listCommunitySkills(options: ListCommunitySkillsOptions = {}) {
  const conditions = [eq(schema.skills.visibility, 'public')];

  if (options.category) {
    conditions.push(eq(schema.skills.category, options.category));
  }
  if (options.search) {
    conditions.push(
      or(
        ilike(schema.skills.name, `%${options.search}%`),
        ilike(schema.skills.description, `%${options.search}%`),
      )!,
    );
  }
  if (options.creatorId) {
    conditions.push(eq(schema.skills.userId, options.creatorId));
  }

  const limit = Math.min(options.limit ?? 24, 100);

  const orderBy =
    options.sort === 'popular'
      ? [desc(schema.skills.usageCount), desc(schema.skills.createdAt)]
      : [desc(schema.skills.source), desc(schema.skills.createdAt)];

  const skills = await db.query.skills.findMany({
    where: and(...conditions),
    orderBy,
    limit: limit + 1,
  });

  const hasMore = skills.length > limit;
  const page = hasMore ? skills.slice(0, limit) : skills;

  // If authenticated, attach isFavorited flag
  let favoriteSet = new Set<string>();
  if (options.userId && page.length > 0) {
    const skillIds = page.map((s) => s.id);
    const favs = await db.query.skillFavorites.findMany({
      where: and(
        eq(schema.skillFavorites.userId, options.userId),
        sql`${schema.skillFavorites.skillId} = ANY(ARRAY[${sql.join(
          skillIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])`,
      ),
    });
    favoriteSet = new Set(favs.map((f) => f.skillId));
  }

  return {
    skills: page.map((s) => ({
      ...redactPrompts(s, options.userId),
      isFavorited: favoriteSet.has(s.id),
    })),
    hasMore,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

// ============================================================
// LIST — TRENDING
// ============================================================

export async function getTrendingSkills(limit = 5) {
  return db.query.skills.findMany({
    where: and(eq(schema.skills.visibility, 'public'), sql`${schema.skills.usageCount} > 0`),
    orderBy: [desc(schema.skills.usageCount)],
    limit: Math.min(limit, 20),
  });
}

// ============================================================
// GET SINGLE SKILL (with access control)
// ============================================================

export async function getSkillByIdOrSlug(idOrSlug: string, requestingUserId?: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const skill = isUuid
    ? await db.query.skills.findFirst({ where: eq(schema.skills.id, idOrSlug) })
    : await db.query.skills.findFirst({ where: eq(schema.skills.slug, idOrSlug) });

  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  // Access control: check if requester can see this skill
  let isAdmin = false;
  if (requestingUserId) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, requestingUserId),
    });
    isAdmin = user?.role === 'Administrator';
  }

  const isOwner = requestingUserId && skill.userId === requestingUserId;

  if (skill.visibility === 'private' && !isOwner && !isAdmin) {
    // Return 404 instead of 403 to prevent enumeration
    throw new NotFoundError('Skill not found');
  }

  // Unlisted skills are accessible by direct link (no block needed)
  // Public skills are accessible to everyone

  // Check favorite status
  let isFavorited = false;
  if (requestingUserId) {
    const fav = await db.query.skillFavorites.findFirst({
      where: and(
        eq(schema.skillFavorites.userId, requestingUserId),
        eq(schema.skillFavorites.skillId, skill.id),
      ),
    });
    isFavorited = !!fav;
  }

  return {
    ...redactPrompts(skill, requestingUserId, isAdmin),
    isFavorited,
  };
}

// ============================================================
// GET SKILL VERSIONS
// ============================================================

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

// ============================================================
// CREATE
// ============================================================

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
  // Check slug uniqueness within user's namespace
  const existing = await db.query.skills.findFirst({
    where: and(eq(schema.skills.slug, data.slug), eq(schema.skills.userId, userId)),
  });

  if (existing) {
    throw new ConflictError('You already have a skill with this slug');
  }

  // Fetch creator info for denormalization
  const creator = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

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
      promptTemplate: data.config.promptTemplate,
      systemPrompt: data.config.systemPrompt ?? null,
      capabilities: data.config.capabilities ?? [],
      defaultProvider: data.config.defaultProvider ?? null,
      defaultModel: data.config.defaultModel ?? null,
      temperature: data.config.temperature ?? null,
      maxTokens: data.config.maxTokens ?? null,
      visibility: 'private',
      showPrompts: false,
      creatorDisplayName: creator?.name ?? null,
      creatorAvatarUrl: null,
    })
    .returning();

  // Sync normalized inputs/outputs
  await syncSkillInputs(skill.id, data.config.inputs ?? []);
  await syncSkillOutputs(skill.id, data.config.outputs ?? []);

  // Create initial version
  await db.insert(schema.skillVersions).values({
    skillId: skill.id,
    version: 1,
    config: data.config,
    changelog: 'Initial version',
  });

  return skill;
}

// ============================================================
// UPDATE
// ============================================================

interface UpdateSkillData {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  config?: SkillConfig;
  visibility?: SkillVisibility;
  showPrompts?: boolean;
  changelog?: string;
}

export async function updateSkill(skillId: string, data: UpdateSkillData, userId: string) {
  const { skill } = await assertSkillOwnership(skillId, userId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.icon !== undefined) updates.icon = data.icon;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.visibility !== undefined) updates.visibility = data.visibility;
  if (data.showPrompts !== undefined) updates.showPrompts = data.showPrompts;

  // If config changed, create a new version + sync normalized tables
  if (data.config) {
    const newVersion = skill.currentVersion + 1;
    updates.config = data.config;
    updates.currentVersion = newVersion;
    updates.promptTemplate = data.config.promptTemplate;
    updates.systemPrompt = data.config.systemPrompt ?? null;
    updates.capabilities = data.config.capabilities ?? [];
    updates.defaultProvider = data.config.defaultProvider ?? null;
    updates.defaultModel = data.config.defaultModel ?? null;
    updates.temperature = data.config.temperature ?? null;
    updates.maxTokens = data.config.maxTokens ?? null;

    await db.insert(schema.skillVersions).values({
      skillId: skill.id,
      version: newVersion,
      config: data.config,
      changelog: data.changelog ?? `Version ${newVersion}`,
    });

    await syncSkillInputs(skill.id, data.config.inputs ?? []);
    await syncSkillOutputs(skill.id, data.config.outputs ?? []);
  }

  const [updated] = await db
    .update(schema.skills)
    .set(updates)
    .where(eq(schema.skills.id, skillId))
    .returning();

  return updated;
}

// ============================================================
// UPDATE VISIBILITY (dedicated endpoint)
// ============================================================

export async function updateVisibility(
  skillId: string,
  visibility: SkillVisibility,
  userId: string,
) {
  await assertSkillOwnership(skillId, userId);

  const [updated] = await db
    .update(schema.skills)
    .set({ visibility, updatedAt: new Date() })
    .where(eq(schema.skills.id, skillId))
    .returning();

  return updated;
}

// ============================================================
// DELETE
// ============================================================

export async function deleteSkill(skillId: string, userId: string) {
  await assertSkillOwnership(skillId, userId);
  await db.delete(schema.skills).where(eq(schema.skills.id, skillId));
}

// ============================================================
// FORK
// ============================================================

export async function forkSkill(skillId: string, userId: string) {
  const source = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });

  if (!source) throw new NotFoundError('Skill not found');

  if (source.visibility === 'private') {
    throw new ForbiddenError('Cannot fork a private skill');
  }

  if (source.userId === userId) {
    throw new ValidationError({ fork: ['Cannot fork your own skill'] });
  }

  // Resolve the root original (if source is itself a fork)
  const rootId = source.forkedFromId ?? source.id;

  // Generate unique slug in user's namespace
  let forkSlug = source.slug;
  let suffix = 0;
  let slugExists = true;
  while (slugExists) {
    const candidate = suffix === 0 ? forkSlug : `${forkSlug}-${suffix}`;
    const existing = await db.query.skills.findFirst({
      where: and(eq(schema.skills.slug, candidate), eq(schema.skills.userId, userId)),
    });
    if (!existing) {
      forkSlug = candidate;
      slugExists = false;
    } else {
      suffix++;
    }
  }

  // Fetch forker's info
  const forker = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  // Build config — respect showPrompts
  const sourceConfig = source.config as SkillConfig;
  const forkConfig: SkillConfig = source.showPrompts
    ? { ...sourceConfig }
    : {
        ...sourceConfig,
        promptTemplate: '',
        systemPrompt: undefined,
      };

  const [forked] = await db
    .insert(schema.skills)
    .values({
      slug: forkSlug,
      name: source.name,
      description: source.description,
      category: source.category,
      source: 'user',
      userId,
      icon: source.icon,
      tags: source.tags as string[],
      config: forkConfig,
      promptTemplate: source.showPrompts ? source.promptTemplate : null,
      systemPrompt: source.showPrompts ? source.systemPrompt : null,
      capabilities: source.capabilities,
      defaultProvider: source.defaultProvider,
      defaultModel: source.defaultModel,
      temperature: source.temperature,
      maxTokens: source.maxTokens,
      visibility: 'private',
      showPrompts: false,
      forkedFromId: rootId,
      creatorDisplayName: forker?.name ?? null,
      creatorAvatarUrl: null,
    })
    .returning();

  // Sync inputs/outputs from source
  await syncSkillInputs(forked.id, sourceConfig.inputs ?? []);
  await syncSkillOutputs(forked.id, sourceConfig.outputs ?? []);

  // Create version 1
  const sourceCreatorName = source.creatorDisplayName ?? 'unknown';
  await db.insert(schema.skillVersions).values({
    skillId: forked.id,
    version: 1,
    config: forkConfig,
    changelog: `Forked from @${sourceCreatorName}/${source.slug}`,
  });

  // Increment source's fork count
  await db
    .update(schema.skills)
    .set({ forkCount: sql`${schema.skills.forkCount} + 1` })
    .where(eq(schema.skills.id, source.id));

  return forked;
}

// ============================================================
// FAVORITES
// ============================================================

export async function toggleFavorite(skillId: string, userId: string) {
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });

  if (!skill) throw new NotFoundError('Skill not found');

  if (skill.visibility === 'private' && skill.userId !== userId) {
    throw new ForbiddenError('Cannot favorite a private skill');
  }

  // Check if already favorited
  const existing = await db.query.skillFavorites.findFirst({
    where: and(
      eq(schema.skillFavorites.userId, userId),
      eq(schema.skillFavorites.skillId, skillId),
    ),
  });

  if (existing) {
    // Unfavorite
    await db.delete(schema.skillFavorites).where(eq(schema.skillFavorites.id, existing.id));
    await db
      .update(schema.skills)
      .set({
        favoriteCount: sql`GREATEST(${schema.skills.favoriteCount} - 1, 0)`,
      })
      .where(eq(schema.skills.id, skillId));
    return { favorited: false };
  } else {
    // Favorite
    await db.insert(schema.skillFavorites).values({ userId, skillId });
    await db
      .update(schema.skills)
      .set({
        favoriteCount: sql`${schema.skills.favoriteCount} + 1`,
      })
      .where(eq(schema.skills.id, skillId));
    return { favorited: true };
  }
}

// ============================================================
// USAGE TRACKING
// ============================================================

export async function incrementUsageCount(skillId: string) {
  await db
    .update(schema.skills)
    .set({
      usageCount: sql`${schema.skills.usageCount} + 1`,
    })
    .where(eq(schema.skills.id, skillId));
}

// ============================================================
// CREATOR INFO SYNC
// ============================================================

export async function syncCreatorInfo(userId: string, name: string, avatarUrl?: string | null) {
  await db
    .update(schema.skills)
    .set({
      creatorDisplayName: name,
      creatorAvatarUrl: avatarUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.skills.userId, userId));
}

// ============================================================
// NORMALIZED TABLE SYNC HELPERS
// ============================================================

async function syncSkillInputs(skillId: string, inputs: SkillConfig['inputs']) {
  await db.delete(schema.skillInputs).where(eq(schema.skillInputs.skillId, skillId));

  if (inputs.length === 0) return;

  await db.insert(schema.skillInputs).values(
    inputs.map((inp, i) => ({
      skillId,
      inputId: inp.id ?? inp.key,
      key: inp.key,
      type: inp.type,
      label: inp.label,
      description: inp.description ?? null,
      isRequired: inp.required ?? false,
      defaultValue: inp.defaultValue ?? null,
      options: inp.options ?? [],
      sortOrder: i,
    })),
  );
}

async function syncSkillOutputs(skillId: string, outputs: SkillConfig['outputs']) {
  await db.delete(schema.skillOutputs).where(eq(schema.skillOutputs.skillId, skillId));

  if (outputs.length === 0) return;

  await db.insert(schema.skillOutputs).values(
    outputs.map((out, i) => ({
      skillId,
      key: out.key,
      type: out.type,
      label: out.label,
      description: out.description ?? null,
      isVisible: out.visible ?? true,
      sortOrder: i,
    })),
  );
}
