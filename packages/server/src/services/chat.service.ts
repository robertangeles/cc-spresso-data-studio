import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { providerRegistry } from './ai/index.js';
import { getActiveRules } from './profile.service.js';
import { withSessionGate } from './session-gate.service.js';
import { NotFoundError } from '../utils/errors.js';
import { stripThinkingBlocks } from './flow-executor.service.js';
import { logger } from '../config/logger.js';
import type { AICompletionRequest, AIMessageContent } from '@cc/shared';

export async function listConversations(userId: string) {
  return db.query.conversations.findMany({
    where: eq(schema.conversations.userId, userId),
    orderBy: [desc(schema.conversations.updatedAt)],
  });
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, userId),
    ),
  });

  if (!conversation) throw new NotFoundError('Conversation');

  const msgs = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: schema.messages.createdAt,
  });

  return { ...conversation, messages: msgs };
}

export async function createConversation(userId: string, model: string, title?: string) {
  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      userId,
      model,
      title: title ?? 'New Chat',
    })
    .returning();

  return conversation;
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, userId),
    ),
  });

  if (!conversation) throw new NotFoundError('Conversation');

  await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
  model?: string,
  systemPrompt?: string,
  role: string = 'Subscriber',
  imageUrls?: string[],
) {
  // Verify ownership
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, userId),
    ),
  });

  if (!conversation) throw new NotFoundError('Conversation');

  const activeModel = model ?? conversation.model;

  // Save user message — store metadata only for images (no base64 in DB)
  const hasImages = imageUrls && imageUrls.length > 0;
  await db.insert(schema.messages).values({
    conversationId,
    role: 'user',
    content: hasImages ? JSON.stringify({ text: content, imageCount: imageUrls.length }) : content,
    contentType: hasImages ? 'multimodal' : 'text',
    model: null,
    tokens: 0,
  });

  // Load conversation history for context
  const history = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: schema.messages.createdAt,
  });

  // Load global rules
  const activeRules = await getActiveRules(userId);
  const globalRules =
    activeRules.length > 0 ? activeRules.map((r) => r.rules).join('\n\n') : undefined;

  // Build messages array
  const aiMessages: AICompletionRequest['messages'] = [];

  // Inject custom system prompt (e.g., from Content Builder prompt library)
  if (systemPrompt) {
    aiMessages.push({ role: 'system', content: systemPrompt });
  }

  if (globalRules) {
    aiMessages.push({
      role: 'system',
      content: `GLOBAL RULES (always follow these):\n\n${globalRules}`,
    });
  }

  // Include conversation history (last 20 messages to manage context)
  const recentHistory = history.slice(-20);
  const lastMsgIndex = recentHistory.length - 1;
  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    const isLastUserMsg = i === lastMsgIndex && msg.role === 'user';

    if (msg.contentType === 'multimodal') {
      try {
        const parsed = JSON.parse(msg.content) as { text?: string; imageCount?: number };

        if (isLastUserMsg && hasImages) {
          // Current message: inject the actual base64 images
          const parts: AIMessageContent = [];
          if (parsed.text) parts.push({ type: 'text', text: parsed.text });
          for (const dataUri of imageUrls!) {
            parts.push({ type: 'image_url', image_url: { url: dataUri } });
          }
          aiMessages.push({ role: 'user', content: parts });
        } else {
          // Historical message: send text only with placeholder
          const text = parsed.text || '';
          const count = parsed.imageCount ?? 0;
          const placeholder = count > 0 ? `\n[${count} image(s) were attached]` : '';
          aiMessages.push({ role: msg.role as 'user' | 'assistant', content: text + placeholder });
        }
      } catch {
        aiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    } else {
      aiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  // Call AI
  logger.info(
    { conversationId, model: activeModel, messageCount: aiMessages.length },
    'Chat completion',
  );

  const response = await withSessionGate(userId, role, () =>
    providerRegistry.complete({
      model: activeModel,
      messages: aiMessages,
    }),
  );

  // Detect image response — strip thinking blocks from reasoning models
  const contentType = response.contentType ?? 'text';
  const responseContent = response.imageUrl ?? stripThinkingBlocks(response.content);

  // Save assistant message
  const [assistantMsg] = await db
    .insert(schema.messages)
    .values({
      conversationId,
      role: 'assistant',
      content: responseContent,
      contentType,
      model: response.model,
      tokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
    })
    .returning();

  // Update conversation timestamp and model
  await db
    .update(schema.conversations)
    .set({ updatedAt: new Date(), model: activeModel })
    .where(eq(schema.conversations.id, conversationId));

  // Auto-generate title after first exchange (2 messages = 1 user + 1 assistant)
  if (history.length <= 1) {
    generateTitle(conversationId, content).catch((err) =>
      logger.error({ err }, 'Failed to generate conversation title — non-blocking'),
    );
  }

  return {
    message: assistantMsg,
    usage: response.usage,
  };
}

async function generateTitle(conversationId: string, firstMessage: string) {
  try {
    // Check if this is a Content Builder conversation — don't rename those
    const conversation = await db.query.conversations.findFirst({
      where: eq(schema.conversations.id, conversationId),
    });
    if (conversation?.title.startsWith('[CB]')) return; // preserve CB prefix

    const response = await providerRegistry.complete({
      model: 'anthropic/claude-haiku-4-5',
      messages: [
        {
          role: 'system',
          content:
            'Generate a short title (3-6 words) for a conversation that starts with the following message. Return ONLY the title, no quotes, no explanation.',
        },
        { role: 'user', content: firstMessage },
      ],
      maxTokens: 20,
      temperature: 0.3,
    });

    const title = response.content
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 255);
    if (title) {
      await db
        .update(schema.conversations)
        .set({ title })
        .where(eq(schema.conversations.id, conversationId));
    }
  } catch {
    // Non-blocking — keep default title
  }
}
