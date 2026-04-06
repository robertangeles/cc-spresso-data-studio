import type { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import type { ApiResponse } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { UnauthorizedError } from '../utils/errors.js';
import * as skillService from '../services/skill.service.js';
import { listGitHubSkills, fetchAndParseSkill } from '../services/skills/importer.js';

// ============================================================
// LIST — MY WORKSHOP
// ============================================================

export async function listMySkills(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { category, search } = req.query;
    const skills = await skillService.listMySkills({
      userId: req.user.userId,
      category: category as string | undefined,
      search: search as string | undefined,
    });

    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// LIST — COMMUNITY
// ============================================================

export async function listCommunitySkills(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const { category, search, sort, creator, limit, cursor } = req.query;
    const userId = req.user?.userId;

    const result = await skillService.listCommunitySkills({
      category: category as string | undefined,
      search: search as string | undefined,
      sort: (sort as 'popular' | 'newest') || undefined,
      creatorId: creator as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      cursor: cursor as string | undefined,
      userId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// LIST — TRENDING
// ============================================================

export async function getTrendingSkills(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const skills = await skillService.getTrendingSkills(limit);
    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// GET SINGLE SKILL
// ============================================================

export async function getSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const skill = await skillService.getSkillByIdOrSlug(req.params.idOrSlug, req.user?.userId);
    res.json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// VERSIONS
// ============================================================

export async function getSkillVersions(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const versions = await skillService.listSkillVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// CREATE
// ============================================================

export async function createSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const skill = await skillService.createSkill(req.body, req.user.userId);
    res.status(201).json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// UPDATE
// ============================================================

export async function updateSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const skill = await skillService.updateSkill(req.params.id, req.body, req.user.userId);
    res.json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// UPDATE VISIBILITY
// ============================================================

export async function updateVisibility(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const skill = await skillService.updateVisibility(
      req.params.id,
      req.body.visibility,
      req.user.userId,
    );
    res.json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// DELETE
// ============================================================

export async function deleteSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await skillService.deleteSkill(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Skill deleted' });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// FORK
// ============================================================

export async function forkSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const forked = await skillService.forkSkill(req.params.id, req.user.userId);
    res.status(201).json({ success: true, data: forked });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// FAVORITE
// ============================================================

export async function toggleFavorite(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const result = await skillService.toggleFavorite(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// IMPORT FROM GITHUB
// ============================================================

export async function listImportableSkills(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const repoUrl = req.query.repoUrl as string | undefined;
    const skills = await listGitHubSkills(repoUrl);
    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
}

export async function importSkill(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { skillName } = req.body;
    if (!skillName || typeof skillName !== 'string') {
      res
        .status(400)
        .json({ success: false, error: 'skillName is required', statusCode: 400 } as never);
      return;
    }

    const repoUrl = req.body.repoUrl as string | undefined;
    const parsed = await fetchAndParseSkill(skillName, repoUrl);

    // Check if already imported in user's namespace
    const existing = await db.query.skills.findFirst({
      where: and(eq(schema.skills.slug, parsed.slug), eq(schema.skills.userId, req.user.userId)),
    });
    if (existing) {
      res
        .status(409)
        .json({ success: false, error: 'Skill already imported', statusCode: 409 } as never);
      return;
    }

    const skill = await skillService.createSkill(
      {
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description,
        category: parsed.category,
        icon: parsed.icon,
        tags: parsed.tags,
        config: parsed.config,
      },
      req.user.userId,
    );

    res.status(201).json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}
