import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as communityService from '../services/community.service.js';

export async function listChannels(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const channels = await communityService.listChannels();
    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}

export async function getChannel(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const channel = await communityService.getChannel(req.params.id);
    res.json({ success: true, data: channel });
  } catch (err) {
    next(err);
  }
}

export async function createChannel(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const channel = await communityService.createChannel(req.body, req.user.userId);
    res.status(201).json({ success: true, data: channel });
  } catch (err) {
    next(err);
  }
}

export async function updateChannel(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const channel = await communityService.updateChannel(req.params.id, req.body);
    res.json({ success: true, data: channel });
  } catch (err) {
    next(err);
  }
}

export async function archiveChannel(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const channel = await communityService.archiveChannel(req.params.id);
    res.json({ success: true, data: channel });
  } catch (err) {
    next(err);
  }
}

export async function getMessages(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { before, limit } = req.query;
    const messages = await communityService.getMessages(req.params.id, {
      before: before as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function sendMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { content, attachments } = req.body;
    const message = await communityService.sendMessage(
      req.params.id,
      req.user.userId,
      content,
      req.user.role,
      attachments,
    );
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

export async function editMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const message = await communityService.editMessage(
      req.params.id,
      req.user.userId,
      req.body.content,
      req.user.role,
    );
    res.json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await communityService.deleteMessage(
      req.params.id,
      req.user.userId,
      req.user.role,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function addReaction(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const reactions = await communityService.addReaction(
      req.params.id,
      req.user.userId,
      req.body.emoji,
    );
    res.json({ success: true, data: reactions });
  } catch (err) {
    next(err);
  }
}

export async function removeReaction(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const reactions = await communityService.removeReaction(
      req.params.id,
      req.user.userId,
      req.params.emoji,
    );
    res.json({ success: true, data: reactions });
  } catch (err) {
    next(err);
  }
}

export async function joinChannel(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await communityService.joinChannel(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function markRead(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await communityService.markChannelRead(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCounts(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const counts = await communityService.getUnreadCounts(req.user.userId);
    res.json({ success: true, data: counts });
  } catch (err) {
    next(err);
  }
}

export async function getChannelMembers(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const members = await communityService.getChannelMembers(req.params.id);
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
}

export async function getAllCommunityUsers(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const users = await communityService.getAllCommunityUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
