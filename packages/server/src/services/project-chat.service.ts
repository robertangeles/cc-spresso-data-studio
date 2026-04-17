import { eq, desc, lt, and, sql, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  projectMessages,
  projectMessageAttachments,
  projectMessageReactions,
  projectReadStatus,
  projectMembers,
  users,
  userProfiles,
} from '../db/schema.js';
import type { ProjectChatMessage, ProjectChatAttachment } from '@cc/shared';
import type { ReactionGroup } from '@cc/shared';

// ── Helpers ─────────────────────────────────────────────────

function sanitize(content: string): string {
  return content.replace(/<[^>]*>/g, '').trim();
}

async function buildMessageResponse(
  msg: typeof projectMessages.$inferSelect,
  requestingUserId?: string,
): Promise<ProjectChatMessage> {
  // Fetch user info + avatar
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(eq(users.id, msg.userId));

  // Fetch attachments
  const attachments = await db
    .select()
    .from(projectMessageAttachments)
    .where(eq(projectMessageAttachments.messageId, msg.id));

  // Fetch reactions
  const reactions = await getReactionGroups(msg.id, requestingUserId);

  // Thread reply count
  const [replyCountResult] = await db
    .select({ count: count() })
    .from(projectMessages)
    .where(eq(projectMessages.parentId, msg.id));

  return {
    id: msg.id,
    projectId: msg.projectId,
    userId: msg.userId,
    content: msg.content,
    parentId: msg.parentId,
    isEdited: msg.isEdited,
    createdAt: msg.createdAt.toISOString(),
    updatedAt: msg.updatedAt.toISOString(),
    user: {
      id: user?.id ?? msg.userId,
      name: user?.name ?? 'Unknown',
      email: user?.email ?? '',
      avatarUrl: user?.avatarUrl ?? null,
    },
    attachments: attachments.map(
      (a): ProjectChatAttachment => ({
        id: a.id,
        messageId: a.messageId,
        type: a.type as 'image' | 'file' | 'link',
        url: a.url,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      }),
    ),
    reactions,
    replyCount: replyCountResult?.count ?? 0,
  };
}

async function getReactionGroups(
  messageId: string,
  requestingUserId?: string,
): Promise<ReactionGroup[]> {
  const rows = await db
    .select({
      emoji: projectMessageReactions.emoji,
      count: count(),
    })
    .from(projectMessageReactions)
    .where(eq(projectMessageReactions.messageId, messageId))
    .groupBy(projectMessageReactions.emoji);

  if (rows.length === 0) return [];

  // Check if requesting user has reacted
  let userReactions = new Set<string>();
  if (requestingUserId) {
    const userRows = await db
      .select({ emoji: projectMessageReactions.emoji })
      .from(projectMessageReactions)
      .where(
        and(
          eq(projectMessageReactions.messageId, messageId),
          eq(projectMessageReactions.userId, requestingUserId),
        ),
      );
    userReactions = new Set(userRows.map((r) => r.emoji));
  }

  return rows.map((r) => ({
    emoji: r.emoji,
    count: Number(r.count),
    hasReacted: userReactions.has(r.emoji),
  }));
}

// ── Membership Check ────────────────────────────────────────

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const [member] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return !!member;
}

// ── Messages ────────────────────────────────────────────────

export async function sendMessage(
  projectId: string,
  userId: string,
  content: string,
  parentId?: string,
  attachments?: Array<{
    type: string;
    url: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }>,
): Promise<ProjectChatMessage> {
  const sanitized = sanitize(content);
  if (!sanitized) throw new Error('Message content is required');

  const [msg] = await db
    .insert(projectMessages)
    .values({
      projectId,
      userId,
      content: sanitized,
      parentId: parentId ?? null,
    })
    .returning();

  // Insert attachments
  if (attachments && attachments.length > 0) {
    await db.insert(projectMessageAttachments).values(
      attachments.map((a) => ({
        messageId: msg.id,
        type: a.type,
        url: a.url,
        fileName: a.fileName ?? null,
        fileSize: a.fileSize ?? null,
        mimeType: a.mimeType ?? null,
      })),
    );
  }

  return buildMessageResponse(msg, userId);
}

export async function getMessages(
  projectId: string,
  options: { before?: string; limit?: number } = {},
  requestingUserId?: string,
): Promise<{ messages: ProjectChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? 50, 100);

  const query = db
    .select()
    .from(projectMessages)
    .where(
      options.before
        ? and(
            eq(projectMessages.projectId, projectId),
            lt(projectMessages.createdAt, new Date(options.before)),
          )
        : eq(projectMessages.projectId, projectId),
    )
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit);

  const result = await Promise.all(
    messages.map((msg) => buildMessageResponse(msg, requestingUserId)),
  );

  return { messages: result, hasMore };
}

export async function getThreadReplies(
  parentId: string,
  requestingUserId?: string,
): Promise<ProjectChatMessage[]> {
  const rows = await db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.parentId, parentId))
    .orderBy(projectMessages.createdAt);

  return Promise.all(rows.map((msg) => buildMessageResponse(msg, requestingUserId)));
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
): Promise<void> {
  const sanitized = sanitize(content);
  if (!sanitized) throw new Error('Message content is required');

  const [msg] = await db
    .select({ userId: projectMessages.userId })
    .from(projectMessages)
    .where(eq(projectMessages.id, messageId));

  if (!msg) throw new Error('Message not found');
  if (msg.userId !== userId) throw new Error('Not authorized to edit this message');

  await db
    .update(projectMessages)
    .set({ content: sanitized, isEdited: true, updatedAt: new Date() })
    .where(eq(projectMessages.id, messageId));
}

export async function deleteMessage(messageId: string, userId: string): Promise<void> {
  const [msg] = await db
    .select({ userId: projectMessages.userId })
    .from(projectMessages)
    .where(eq(projectMessages.id, messageId));

  if (!msg) throw new Error('Message not found');
  if (msg.userId !== userId) throw new Error('Not authorized to delete this message');

  await db.delete(projectMessages).where(eq(projectMessages.id, messageId));
}

// ── Reactions ───────────────────────────────────────────────

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<ReactionGroup[]> {
  await db
    .insert(projectMessageReactions)
    .values({ messageId, userId, emoji })
    .onConflictDoNothing();

  return getReactionGroups(messageId, userId);
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<ReactionGroup[]> {
  await db
    .delete(projectMessageReactions)
    .where(
      and(
        eq(projectMessageReactions.messageId, messageId),
        eq(projectMessageReactions.userId, userId),
        eq(projectMessageReactions.emoji, emoji),
      ),
    );

  return getReactionGroups(messageId, userId);
}

// ── Read Status ─────────────────────────────────────────────

export async function markRead(
  projectId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await db
    .insert(projectReadStatus)
    .values({
      projectId,
      userId,
      lastReadAt: new Date(),
      lastMessageId: messageId,
    })
    .onConflictDoUpdate({
      target: [projectReadStatus.projectId, projectReadStatus.userId],
      set: {
        lastReadAt: new Date(),
        lastMessageId: messageId,
      },
    });
}

export async function getUnreadCount(projectId: string, userId: string): Promise<number> {
  const [readRow] = await db
    .select({ lastReadAt: projectReadStatus.lastReadAt })
    .from(projectReadStatus)
    .where(and(eq(projectReadStatus.projectId, projectId), eq(projectReadStatus.userId, userId)));

  const since = readRow?.lastReadAt ?? new Date(0);

  const [result] = await db
    .select({ count: count() })
    .from(projectMessages)
    .where(
      and(eq(projectMessages.projectId, projectId), sql`${projectMessages.createdAt} > ${since}`),
    );

  return Number(result?.count ?? 0);
}
