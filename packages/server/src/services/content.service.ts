import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// --- Channel seed ---

const DEFAULT_CHANNELS = [
  { name: 'Twitter / X', slug: 'twitter', type: 'twitter', icon: '🐦', config: { charLimit: 280, format: 'short-form' } },
  { name: 'LinkedIn', slug: 'linkedin', type: 'linkedin', icon: '💼', config: { charLimit: 3000, format: 'professional' } },
  { name: 'Email', slug: 'email', type: 'email', icon: '📧', config: { charLimit: 0, format: 'html' } },
  { name: 'Blog', slug: 'blog', type: 'blog', icon: '📝', config: { charLimit: 0, format: 'long-form' } },
  { name: 'Instagram', slug: 'instagram', type: 'instagram', icon: '📸', config: { charLimit: 2200, format: 'visual' } },
];

export async function seedChannels(): Promise<void> {
  for (const ch of DEFAULT_CHANNELS) {
    const existing = await db.query.channels.findFirst({
      where: eq(schema.channels.slug, ch.slug),
    });
    if (!existing) {
      await db.insert(schema.channels).values(ch);
      logger.info({ channel: ch.name }, 'Channel seeded');
    }
  }
}

// --- Channel queries ---

export async function listChannels() {
  return db.query.channels.findMany({
    where: eq(schema.channels.isActive, true),
    orderBy: schema.channels.name,
  });
}

// --- Content CRUD ---

interface CreateContentData {
  userId: string;
  flowId?: string;
  channelId?: string;
  title: string;
  body: string;
  contentType?: string;
  status?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function createContentItem(data: CreateContentData) {
  const [item] = await db
    .insert(schema.contentItems)
    .values({
      userId: data.userId,
      flowId: data.flowId ?? null,
      channelId: data.channelId ?? null,
      title: data.title,
      body: data.body,
      contentType: data.contentType ?? 'markdown',
      status: data.status ?? 'draft',
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
    })
    .returning();

  return item;
}

interface ListContentOptions {
  userId: string;
  channelId?: string;
  status?: string;
  search?: string;
}

export async function listContentItems(options: ListContentOptions) {
  const conditions = [eq(schema.contentItems.userId, options.userId)];

  if (options.channelId) {
    conditions.push(eq(schema.contentItems.channelId, options.channelId));
  }
  if (options.status) {
    conditions.push(eq(schema.contentItems.status, options.status));
  }
  if (options.search) {
    conditions.push(
      or(
        ilike(schema.contentItems.title, `%${options.search}%`),
        ilike(schema.contentItems.body, `%${options.search}%`),
      )!,
    );
  }

  return db.query.contentItems.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.contentItems.createdAt)],
  });
}

export async function getContentItem(id: string, userId: string) {
  const item = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, id),
  });

  if (!item) throw new NotFoundError('Content item not found');
  if (item.userId !== userId) throw new ForbiddenError('Access denied');

  return item;
}

interface UpdateContentData {
  title?: string;
  body?: string;
  channelId?: string | null;
  status?: string;
  tags?: string[];
}

export async function updateContentItem(id: string, data: UpdateContentData, userId: string) {
  const item = await getContentItem(id, userId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.body !== undefined) updates.body = data.body;
  if (data.channelId !== undefined) updates.channelId = data.channelId;
  if (data.status !== undefined) updates.status = data.status;
  if (data.tags !== undefined) updates.tags = data.tags;

  const [updated] = await db
    .update(schema.contentItems)
    .set(updates)
    .where(eq(schema.contentItems.id, item.id))
    .returning();

  return updated;
}

export async function deleteContentItem(id: string, userId: string) {
  await getContentItem(id, userId);
  await db.delete(schema.contentItems).where(eq(schema.contentItems.id, id));
}
