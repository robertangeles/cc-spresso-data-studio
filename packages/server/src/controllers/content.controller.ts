import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as contentService from '../services/content.service.js';
import { scrapeUrl } from '../services/scraper.service.js';

export async function listContent(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { channelId, status, search } = req.query;
    const items = await contentService.listContentItems({
      userId: req.user.userId,
      channelId: channelId as string | undefined,
      status: status as string | undefined,
      search: search as string | undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function getContent(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const item = await contentService.getContentItem(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateContent(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const item = await contentService.updateContentItem(req.params.id, req.body, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function deleteContent(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await contentService.deleteContentItem(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Content deleted' });
  } catch (err) {
    next(err);
  }
}

export async function remixContent(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { sourceContentIds, targetChannelIds, style, customPrompt, model } = req.body;

    // Validate inputs
    if (!Array.isArray(sourceContentIds) || sourceContentIds.length === 0) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'sourceContentIds must be a non-empty array',
        });
      return;
    }
    if (sourceContentIds.length > 10) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'Cannot remix more than 10 source items at once',
        });
      return;
    }
    if (!Array.isArray(targetChannelIds) || targetChannelIds.length === 0) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'targetChannelIds must be a non-empty array',
        });
      return;
    }
    if (!style || typeof style !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'style is required' });
      return;
    }
    if (style === 'custom' && (!customPrompt || typeof customPrompt !== 'string')) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'customPrompt is required when style is "custom"',
        });
      return;
    }
    if (typeof customPrompt === 'string' && customPrompt.length > 2000) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'customPrompt must be under 2000 characters',
        });
      return;
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: contentService.RemixProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    await contentService.remixContent(
      {
        sourceContentIds,
        targetChannelIds,
        style,
        customPrompt,
        userId: req.user.userId,
        role: req.user.role,
        model,
      },
      sendEvent,
    );

    res.end();
  } catch (err) {
    // If SSE headers already sent, send error event and close
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Remix failed' })}\n\n`,
      );
      res.end();
    } else {
      next(err);
    }
  }
}

export async function deleteBatch(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ success: false, data: null, message: 'ids must be a non-empty array' });
      return;
    }
    if (ids.length > 100) {
      res
        .status(400)
        .json({ success: false, data: null, message: 'Cannot delete more than 100 items at once' });
      return;
    }
    const deleted = await contentService.deleteBatchContentItems(ids, req.user.userId);
    res.json({ success: true, data: { deleted }, message: `${deleted} item(s) deleted` });
  } catch (err) {
    next(err);
  }
}

export async function createBatch(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const items = await contentService.createMultiPlatformContent({
      ...req.body,
      userId: req.user.userId,
    });
    res.status(201).json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function generateMulti(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const result = await contentService.generateMultiPlatformContent({
      ...req.body,
      userId: req.user.userId,
      role: req.user.role,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function generateTemplate(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { category, model, context } = req.body;
    if (!category || typeof category !== 'string') {
      res.status(400).json({
        success: false,
        error: 'category is required (string)',
      } as unknown as ApiResponse<unknown>);
      return;
    }
    const validCategories = [
      'product-launch',
      'behind-the-scenes',
      'tips-and-tricks',
      'announcement',
    ];
    if (!validCategories.includes(category)) {
      res.status(400).json({
        success: false,
        error: `Invalid category. Valid: ${validCategories.join(', ')}`,
      } as unknown as ApiResponse<unknown>);
      return;
    }
    const result = await contentService.generateTemplate({
      category,
      model,
      context,
      userId: req.user.userId,
      role: req.user.role,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listChannels(
  _req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    const channels = await contentService.listChannels();
    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}

export async function scrapeUrlHandler(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'url is required' });
      return;
    }
    if (url.length > 2000) {
      res
        .status(400)
        .json({ success: false, data: null, message: 'URL must be under 2000 characters' });
      return;
    }

    const result = await scrapeUrl(url);
    res.json({ success: true, data: result });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('not allowed') ||
        err.message.includes('Invalid URL') ||
        err.message.includes('Only http'))
    ) {
      res.status(400).json({ success: false, data: null, message: err.message });
      return;
    }
    next(err);
  }
}

export async function repurposeContent(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { sourceText, sourceUrl, targetChannelIds, style, customPrompt, model } = req.body;

    if (!sourceText || typeof sourceText !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'sourceText is required' });
      return;
    }
    if (sourceText.length > 50_000) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'sourceText must be under 50,000 characters',
        });
      return;
    }
    if (!Array.isArray(targetChannelIds) || targetChannelIds.length === 0) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'targetChannelIds must be a non-empty array',
        });
      return;
    }
    if (!style || typeof style !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'style is required' });
      return;
    }
    if (style === 'custom' && (!customPrompt || typeof customPrompt !== 'string')) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'customPrompt is required when style is "custom"',
        });
      return;
    }
    if (typeof customPrompt === 'string' && customPrompt.length > 2000) {
      res
        .status(400)
        .json({
          success: false,
          data: null,
          message: 'customPrompt must be under 2000 characters',
        });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: contentService.RemixProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    await contentService.repurposeContent(
      {
        sourceText,
        sourceUrl,
        targetChannelIds,
        style,
        customPrompt,
        userId: req.user.userId,
        role: req.user.role,
        model,
      },
      sendEvent,
    );

    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Repurpose failed' })}\n\n`,
      );
      res.end();
    } else {
      next(err);
    }
  }
}
