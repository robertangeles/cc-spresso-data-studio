import type { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service.js';
import * as activityService from '../services/project-activity.service.js';
import * as projectChatService from '../services/project-chat.service.js';
import { UnauthorizedError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const projects = await projectService.listProjects(req.user.userId);

    res.json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const project = await projectService.createProject(req.user.userId, req.body);

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const project = await projectService.getProject(req.params.projectId, req.user.userId);

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const project = await projectService.updateProject(
      req.params.projectId,
      req.user.userId,
      req.body,
    );

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteProject(req.params.projectId, req.user.userId);

    res.json({ success: true, data: null, message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export async function addColumn(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const column = await projectService.addColumn(req.params.projectId, req.user.userId, req.body);

    res.status(201).json({ success: true, data: column });
  } catch (err) {
    next(err);
  }
}

export async function updateColumn(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const column = await projectService.updateColumn(
      req.params.columnId,
      req.user.userId,
      req.body,
    );

    res.json({ success: true, data: column });
  } catch (err) {
    next(err);
  }
}

export async function deleteColumn(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteColumn(req.params.columnId, req.user.userId);

    res.json({ success: true, data: null, message: 'Column deleted' });
  } catch (err) {
    next(err);
  }
}

export async function reorderColumns(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.reorderColumns(req.params.projectId, req.user.userId, req.body.columnIds);

    res.json({ success: true, data: null, message: 'Columns reordered' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function createCard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const card = await projectService.createCard(req.params.projectId, req.user.userId, req.body);

    res.status(201).json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
}

export async function updateCard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const card = await projectService.updateCard(req.params.cardId, req.user.userId, req.body);

    res.json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
}

export async function deleteCard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteCard(req.params.cardId, req.user.userId);

    res.json({ success: true, data: null, message: 'Card deleted' });
  } catch (err) {
    next(err);
  }
}

export async function moveCard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { columnId, sortOrder } = req.body;
    const card = await projectService.moveCard(
      req.params.cardId,
      req.user.userId,
      columnId,
      sortOrder,
    );

    res.json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
}

export async function reorderCards(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { cardIds, columnId } = req.body;
    await projectService.reorderCards(req.params.projectId, req.user.userId, cardIds, columnId);

    res.json({ success: true, data: null, message: 'Cards reordered' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function listComments(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const comments = await projectService.listComments(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
    );

    res.json({ success: true, data: comments });
  } catch (err) {
    next(err);
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const comment = await projectService.addComment(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      req.body.content,
    );

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
}

export async function updateComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const comment = await projectService.updateComment(
      req.params.projectId,
      req.user.userId,
      req.params.commentId,
      req.body.content,
    );

    res.json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteComment(req.params.projectId, req.user.userId, req.params.commentId);

    res.json({ success: true, data: null, message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function listAttachments(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const attachments = await projectService.listAttachments(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
    );

    res.json({ success: true, data: attachments });
  } catch (err) {
    next(err);
  }
}

export async function addAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const attachment = await projectService.addAttachment(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      req.body,
    );

    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    next(err);
  }
}

export async function deleteAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteAttachment(
      req.params.projectId,
      req.user.userId,
      req.params.attachmentId,
    );

    res.json({ success: true, data: null, message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
}

export async function uploadAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const attachment = await projectService.uploadCardAttachment(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
    );

    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

export async function listProjectMembers(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const members = await projectService.listProjectMembers(req.params.projectId, req.user.userId);
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
}

export async function addProjectMember(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { userId, role } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required' });
      return;
    }
    const member = await projectService.addProjectMember(req.params.projectId, req.user.userId, {
      userId,
      role: role ?? 'member',
    });
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function updateProjectMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { role } = req.body;
    if (!role) {
      res.status(400).json({ success: false, message: 'role is required' });
      return;
    }
    const member = await projectService.updateProjectMemberRole(
      req.params.projectId,
      req.user.userId,
      req.params.userId,
      role,
    );
    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function removeProjectMember(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.removeProjectMember(
      req.params.projectId,
      req.user.userId,
      req.params.userId,
    );
    res.json({ success: true, data: null, message: 'Member removed' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Card Labels
// ---------------------------------------------------------------------------

export async function listLabels(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const labels = await projectService.listLabels(req.params.projectId, req.user.userId);
    res.json({ success: true, data: labels });
  } catch (err) {
    next(err);
  }
}

export async function createLabel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { name, color } = req.body;
    if (!name || !color) {
      res.status(400).json({ success: false, message: 'name and color are required' });
      return;
    }
    const label = await projectService.createLabel(req.params.projectId, req.user.userId, {
      name,
      color,
    });
    res.status(201).json({ success: true, data: label });
  } catch (err) {
    next(err);
  }
}

export async function updateLabel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const label = await projectService.updateLabel(
      req.params.projectId,
      req.user.userId,
      req.params.labelId,
      req.body,
    );
    res.json({ success: true, data: label });
  } catch (err) {
    next(err);
  }
}

export async function deleteLabel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.deleteLabel(req.params.projectId, req.user.userId, req.params.labelId);
    res.json({ success: true, data: null, message: 'Label deleted' });
  } catch (err) {
    next(err);
  }
}

export async function assignLabel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { labelId } = req.body;
    if (!labelId) {
      res.status(400).json({ success: false, message: 'labelId is required' });
      return;
    }
    const result = await projectService.assignLabel(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      labelId,
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function removeCardLabel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await projectService.removeCardLabel(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      req.params.labelId,
    );
    res.json({ success: true, data: null, message: 'Label removed' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export async function listActivities(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const entityType = req.query.entityType as string | undefined;

    const activities = await activityService.listActivities(req.params.projectId, req.user.userId, {
      limit,
      offset,
      entityType,
    });
    res.json({ success: true, data: activities });
  } catch (err) {
    next(err);
  }
}

export async function listCardActivities(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const activities = await activityService.listCardActivities(
      req.params.projectId,
      req.user.userId,
      req.params.cardId,
      { limit, offset },
    );
    res.json({ success: true, data: activities });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Chat Messages (REST fallback)
// ---------------------------------------------------------------------------

export async function listChatMessages(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { projectId } = req.params;
    const before = req.query.before as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await projectChatService.getMessages(
      projectId,
      { before, limit },
      req.user.userId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getChatUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { projectId } = req.params;
    const count = await projectChatService.getUnreadCount(projectId, req.user.userId);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
}
