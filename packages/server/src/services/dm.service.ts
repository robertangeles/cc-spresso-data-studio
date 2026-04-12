import { db } from '../db/index.js';
import {
  directConversations,
  directConversationMembers,
  directMessages,
  directMessageAttachments,
  users,
  userProfiles,
} from '../db/schema.js';
import { eq, and, desc, lt, sql, count, ne } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import * as blockService from './block.service.js';

/**
 * Get or create a DM conversation between two users.
 */
export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  if (userIdA === userIdB) {
    throw new ValidationError({ userId: ['Cannot start a conversation with yourself'] });
  }

  // Check if target user exists
  const [targetUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userIdB))
    .limit(1);

  if (!targetUser) throw new NotFoundError('User');

  // Check blocks (bidirectional)
  const blocked = await blockService.isEitherBlocked(userIdA, userIdB);
  if (blocked) {
    throw new ForbiddenError('Cannot message this user');
  }

  // Find existing conversation between these two users
  const existing = await db
    .select({ conversationId: directConversationMembers.conversationId })
    .from(directConversationMembers)
    .where(eq(directConversationMembers.userId, userIdA));

  for (const row of existing) {
    const [otherMember] = await db
      .select({ userId: directConversationMembers.userId })
      .from(directConversationMembers)
      .where(
        and(
          eq(directConversationMembers.conversationId, row.conversationId),
          ne(directConversationMembers.userId, userIdA),
        ),
      )
      .limit(1);

    if (otherMember?.userId === userIdB) {
      // Found existing conversation
      return { conversationId: row.conversationId, created: false };
    }
  }

  // Create new conversation
  const [conversation] = await db.insert(directConversations).values({}).returning();

  await db.insert(directConversationMembers).values([
    { conversationId: conversation.id, userId: userIdA },
    { conversationId: conversation.id, userId: userIdB },
  ]);

  return { conversationId: conversation.id, created: true };
}

/**
 * List DM conversations for a user with last message preview.
 */
export async function listConversations(userId: string) {
  // Get all conversation IDs for this user
  const memberships = await db
    .select({ conversationId: directConversationMembers.conversationId })
    .from(directConversationMembers)
    .where(eq(directConversationMembers.userId, userId));

  const conversations = [];

  for (const m of memberships) {
    // Get the other member
    const [otherMember] = await db
      .select({
        userId: directConversationMembers.userId,
        name: users.name,
        email: users.email,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(directConversationMembers)
      .innerJoin(users, eq(directConversationMembers.userId, users.id))
      .leftJoin(userProfiles, eq(directConversationMembers.userId, userProfiles.userId))
      .where(
        and(
          eq(directConversationMembers.conversationId, m.conversationId),
          ne(directConversationMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!otherMember) continue;

    // Check if blocked (filter out blocked conversations)
    const blocked = await blockService.isBlocked(userId, otherMember.userId);
    if (blocked) continue;

    // Get last message
    const [lastMessage] = await db
      .select({
        content: directMessages.content,
        createdAt: directMessages.createdAt,
        userId: directMessages.userId,
      })
      .from(directMessages)
      .where(eq(directMessages.conversationId, m.conversationId))
      .orderBy(desc(directMessages.createdAt))
      .limit(1);

    // Get unread count
    const [membership] = await db
      .select({ lastReadMessageId: directConversationMembers.lastReadMessageId })
      .from(directConversationMembers)
      .where(
        and(
          eq(directConversationMembers.conversationId, m.conversationId),
          eq(directConversationMembers.userId, userId),
        ),
      )
      .limit(1);

    let unreadCount = 0;
    if (membership?.lastReadMessageId) {
      const [lastRead] = await db
        .select({ createdAt: directMessages.createdAt })
        .from(directMessages)
        .where(eq(directMessages.id, membership.lastReadMessageId))
        .limit(1);

      if (lastRead) {
        const [result] = await db
          .select({ count: count() })
          .from(directMessages)
          .where(
            and(
              eq(directMessages.conversationId, m.conversationId),
              sql`${directMessages.createdAt} > ${lastRead.createdAt}`,
              ne(directMessages.userId, userId),
            ),
          );
        unreadCount = result?.count ?? 0;
      }
    } else if (lastMessage) {
      const [result] = await db
        .select({ count: count() })
        .from(directMessages)
        .where(
          and(
            eq(directMessages.conversationId, m.conversationId),
            ne(directMessages.userId, userId),
          ),
        );
      unreadCount = result?.count ?? 0;
    }

    conversations.push({
      conversationId: m.conversationId,
      otherUser: otherMember,
      lastMessage: lastMessage || null,
      unreadCount,
    });
  }

  // Sort by last message time
  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
    const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
    return bTime - aTime;
  });

  return conversations;
}

/**
 * Send a DM.
 */
export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
  attachments?: Array<{
    type: string;
    url: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }>,
) {
  const trimmed = content?.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new ValidationError({ content: ['Message content is required'] });
  }
  if (trimmed.length > 4000) {
    throw new ValidationError({ content: ['Message must be 4000 characters or less'] });
  }

  // Verify membership
  const [membership] = await db
    .select({ id: directConversationMembers.id })
    .from(directConversationMembers)
    .where(
      and(
        eq(directConversationMembers.conversationId, conversationId),
        eq(directConversationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) throw new ForbiddenError('You are not a member of this conversation');

  // Check if the other member has blocked the sender
  const [otherMember] = await db
    .select({ userId: directConversationMembers.userId })
    .from(directConversationMembers)
    .where(
      and(
        eq(directConversationMembers.conversationId, conversationId),
        ne(directConversationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (otherMember) {
    const blocked = await blockService.isEitherBlocked(userId, otherMember.userId);
    if (blocked) throw new ForbiddenError('Cannot message this user');
  }

  const sanitized = trimmed.replace(/<[^>]*>/g, '');

  const [message] = await db
    .insert(directMessages)
    .values({ conversationId, userId, content: sanitized })
    .returning();

  // Insert attachments
  let messageAttachments: Array<Record<string, unknown>> = [];
  if (attachments && attachments.length > 0) {
    const values = attachments.map((att, idx) => ({
      messageId: message.id,
      type: att.type,
      url: att.url,
      fileName: att.fileName || null,
      fileSize: att.fileSize || null,
      mimeType: att.mimeType || null,
      sortOrder: idx,
    }));

    messageAttachments = await db.insert(directMessageAttachments).values(values).returning();
  }

  // Fetch sender info + avatar
  const [user] = await db
    .select({ name: users.name, email: users.email, avatarUrl: userProfiles.avatarUrl })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return {
    ...message,
    user: { id: userId, name: user?.name, email: user?.email, avatarUrl: user?.avatarUrl ?? null },
    attachments: messageAttachments,
  };
}

/**
 * Get DM message history with cursor pagination.
 */
export async function getMessages(
  conversationId: string,
  userId: string,
  options: { before?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit || 50, 100);

  // Verify membership
  const [membership] = await db
    .select({ id: directConversationMembers.id })
    .from(directConversationMembers)
    .where(
      and(
        eq(directConversationMembers.conversationId, conversationId),
        eq(directConversationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) throw new ForbiddenError('You are not a member of this conversation');

  const conditions = [eq(directMessages.conversationId, conversationId)];

  if (options.before) {
    const [cursorMsg] = await db
      .select({ createdAt: directMessages.createdAt })
      .from(directMessages)
      .where(eq(directMessages.id, options.before))
      .limit(1);

    if (cursorMsg) {
      conditions.push(lt(directMessages.createdAt, cursorMsg.createdAt));
    }
  }

  const messages = await db
    .select({
      id: directMessages.id,
      conversationId: directMessages.conversationId,
      userId: directMessages.userId,
      content: directMessages.content,
      isEdited: directMessages.isEdited,
      createdAt: directMessages.createdAt,
      updatedAt: directMessages.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: userProfiles.avatarUrl,
    })
    .from(directMessages)
    .innerJoin(users, eq(directMessages.userId, users.id))
    .leftJoin(userProfiles, eq(directMessages.userId, userProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(directMessages.createdAt))
    .limit(limit);

  // Fetch attachments
  if (messages.length > 0) {
    const messageIds = messages.map((m) => m.id);
    const attachments = await db
      .select()
      .from(directMessageAttachments)
      .where(
        sql`${directMessageAttachments.messageId} IN (${sql.join(
          messageIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    const attachmentMap = new Map<string, Array<Record<string, unknown>>>();
    for (const att of attachments) {
      if (!attachmentMap.has(att.messageId)) attachmentMap.set(att.messageId, []);
      attachmentMap.get(att.messageId)!.push(att);
    }

    return messages.map((m) => ({
      ...m,
      user: {
        id: m.userId,
        name: m.userName,
        email: m.userEmail,
        avatarUrl: m.userAvatarUrl ?? null,
      },
      attachments: attachmentMap.get(m.id) || [],
    }));
  }

  return [];
}

/**
 * Edit a DM (own message only, no admin override for DMs).
 */
export async function editMessage(messageId: string, userId: string, content: string) {
  const trimmed = content?.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new ValidationError({ content: ['Message content is required'] });
  }
  if (trimmed.length > 4000) {
    throw new ValidationError({ content: ['Message must be 4000 characters or less'] });
  }

  const [message] = await db
    .select()
    .from(directMessages)
    .where(eq(directMessages.id, messageId))
    .limit(1);

  if (!message) throw new NotFoundError('Message');
  if (message.userId !== userId) {
    throw new ForbiddenError('You can only edit your own messages');
  }

  const sanitized = trimmed.replace(/<[^>]*>/g, '');
  const [updated] = await db
    .update(directMessages)
    .set({ content: sanitized, isEdited: true, updatedAt: new Date() })
    .where(eq(directMessages.id, messageId))
    .returning();

  return updated;
}

/**
 * Delete a DM (own message only).
 */
export async function deleteMessage(messageId: string, userId: string) {
  const [message] = await db
    .select()
    .from(directMessages)
    .where(eq(directMessages.id, messageId))
    .limit(1);

  if (!message) throw new NotFoundError('Message');
  if (message.userId !== userId) {
    throw new ForbiddenError('You can only delete your own messages');
  }

  await db.delete(directMessages).where(eq(directMessages.id, messageId));
  return { id: messageId, conversationId: message.conversationId };
}

/**
 * Update last read message for a DM conversation.
 */
export async function updateLastRead(conversationId: string, userId: string, messageId: string) {
  await db
    .update(directConversationMembers)
    .set({ lastReadMessageId: messageId })
    .where(
      and(
        eq(directConversationMembers.conversationId, conversationId),
        eq(directConversationMembers.userId, userId),
      ),
    );
}

export async function markConversationRead(conversationId: string, userId: string) {
  const [latest] = await db
    .select({ id: directMessages.id })
    .from(directMessages)
    .where(eq(directMessages.conversationId, conversationId))
    .orderBy(desc(directMessages.createdAt))
    .limit(1);

  if (latest) {
    await updateLastRead(conversationId, userId, latest.id);
  }

  return { conversationId, read: true };
}
