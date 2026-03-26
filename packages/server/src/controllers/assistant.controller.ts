import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import { providerRegistry } from '../services/ai/provider.registry.js';
import { SITE_ASSISTANT_PROMPT } from '../prompts/site-assistant.js';
import { logger } from '../config/logger.js';

export async function chat(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { message, currentPage, history } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, data: null, message: 'Message is required' });
    }

    const systemPrompt = SITE_ASSISTANT_PROMPT.replace('{{currentPage}}', currentPage || '/unknown');

    // Build message history
    const messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }> = [
      { role: 'system' as const, content: systemPrompt },
    ];

    // Include recent history if provided (last 10 messages max)
    if (Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    const response = await providerRegistry.complete({
      model: 'claude-haiku-4-5',
      messages,
      temperature: 0.5,
      maxTokens: 1000,
    });

    logger.info({ currentPage, messageLength: message.length }, 'Site assistant chat');

    res.json({ success: true, data: { reply: response.content } });
  } catch (err) {
    next(err);
  }
}
