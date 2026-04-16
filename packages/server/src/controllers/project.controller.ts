import type { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service.js';
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
