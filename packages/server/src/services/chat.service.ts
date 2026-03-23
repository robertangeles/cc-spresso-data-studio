import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { providerRegistry } from './ai/index.js';
import { getActiveRules } from './profile.service.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import type { AICompletionRequest } from '@cc/shared';

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
  const [conversation] = await db.insert(schema.conversations).values({
    userId,
    model,
    title: title ?? 'New Chat',
  }).returning();

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

  // Save user message
  await db.insert(schema.messages).values({
    conversationId,
    role: 'user',
    content,
    contentType: 'text',
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
  const globalRules = activeRules.length > 0
    ? activeRules.map((r) => r.rules).join('\n\n')
    : undefined;

  // Build messages array
  const aiMessages: AICompletionRequest['messages'] = [];
  if (globalRules) {
    aiMessages.push({ role: 'system', content: `GLOBAL RULES (always follow these):\n\n${globalRules}` });
  }

  // Include conversation history (last 20 messages to manage context)
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    aiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  // Call AI
  logger.info({ conversationId, model: activeModel, messageCount: aiMessages.length }, 'Chat completion');

  const response = await providerRegistry.complete({
    model: activeModel,
    messages: aiMessages,
  });

  // Detect image response
  const contentType = response.contentType ?? 'text';
  const responseContent = response.imageUrl ?? response.content;

  // Save assistant message
  const [assistantMsg] = await db.insert(schema.messages).values({
    conversationId,
    role: 'assistant',
    content: responseContent,
    contentType,
    model: response.model,
    tokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
  }).returning();

  // Update conversation timestamp and model
  await db.update(schema.conversations)
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
    const response = await providerRegistry.complete({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'system', content: 'Generate a short title (3-6 words) for a conversation that starts with the following message. Return ONLY the title, no quotes, no explanation.' },
        { role: 'user', content: firstMessage },
      ],
      maxTokens: 20,
      temperature: 0.3,
    });

    const title = response.content.trim().replace(/^["']|["']$/g, '').slice(0, 255);
    if (title) {
      await db.update(schema.conversations)
        .set({ title })
        .where(eq(schema.conversations.id, conversationId));
    }
  } catch {
    // Non-blocking — keep default title
  }
}
