import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as skillService from '../services/skill.service.js';
import { listGitHubSkills, fetchAndParseSkill } from '../services/skills/importer.js';

export async function listSkills(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { category, source, search } = req.query;
    const userId = req.user?.userId;

    const skills = await skillService.listSkills({
      category: category as string | undefined,
      source: source as string | undefined,
      search: search as string | undefined,
      userId,
    });

    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
}

export async function getSkill(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const skill = await skillService.getSkillByIdOrSlug(req.params.idOrSlug);
    res.json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

export async function getSkillVersions(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const versions = await skillService.listSkillVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (err) {
    next(err);
  }
}

export async function createSkill(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const skill = await skillService.createSkill(req.body, req.user.userId);
    res.status(201).json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

export async function updateSkill(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const skill = await skillService.updateSkill(req.params.id, req.body, req.user.userId);
    res.json({ success: true, data: skill });
  } catch (err) {
    next(err);
  }
}

export async function deleteSkill(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await skillService.deleteSkill(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Skill deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listImportableSkills(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const repoUrl = req.query.repoUrl as string | undefined;
    const skills = await listGitHubSkills(repoUrl);
    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
}

export async function importSkill(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { skillName } = req.body;
    if (!skillName || typeof skillName !== 'string') {
      res.status(400).json({ success: false, error: 'skillName is required', statusCode: 400 } as never);
      return;
    }

    const repoUrl = req.body.repoUrl as string | undefined;
    const parsed = await fetchAndParseSkill(skillName, repoUrl);

    // Check if already imported
    try {
      await skillService.getSkillByIdOrSlug(parsed.slug);
      res.status(409).json({ success: false, error: 'Skill already imported', statusCode: 409 } as never);
      return;
    } catch {
      // Not found — good, we can import
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

    // Auto-publish imported skills from trusted source
    const published = await skillService.updateSkill(skill.id, { isPublished: true }, req.user.userId);

    res.status(201).json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
}
