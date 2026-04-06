import { db } from '../db/index.js';
import {
  communityChannels,
  communityMessages,
  communityMessageAttachments,
  communityReactions,
  channelMembers,
  users,
  userProfiles,
} from '../db/schema.js';
import { eq, and, desc, lt, sql, count } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// ── Channels ────────────────────────────────────────────────

export async function listChannels() {
  return db
    .select()
    .from(communityChannels)
    .where(eq(communityChannels.isArchived, false))
    .orderBy(communityChannels.sortOrder, communityChannels.name);
}

export async function getChannel(channelId: string) {
  const [channel] = await db
    .select()
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');

  const [memberCount] = await db
    .select({ count: count() })
    .from(channelMembers)
    .where(eq(channelMembers.channelId, channelId));

  return { ...channel, memberCount: memberCount?.count ?? 0 };
}

export async function createChannel(
  data: { name: string; description?: string; type?: string; sortOrder?: number },
  userId: string,
) {
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError({ name: ['Channel name is required'] });
  }
  if (data.name.length > 100) {
    throw new ValidationError({ name: ['Channel name must be 100 characters or less'] });
  }

  // Check for duplicate slug
  const [existing] = await db
    .select({ id: communityChannels.id })
    .from(communityChannels)
    .where(eq(communityChannels.slug, slug))
    .limit(1);

  if (existing) throw new ConflictError(`Channel with slug "${slug}" already exists`);

  const [channel] = await db
    .insert(communityChannels)
    .values({
      name: data.name.trim(),
      slug,
      description: data.description?.trim() || null,
      type: data.type || 'text',
      sortOrder: data.sortOrder ?? 0,
      createdBy: userId,
    })
    .returning();

  logger.info({ channelId: channel.id, slug }, 'Community channel created');
  return channel;
}

export async function updateChannel(
  channelId: string,
  data: {
    name?: string;
    description?: string;
    type?: string;
    sortOrder?: number;
    isArchived?: boolean;
  },
) {
  const [channel] = await db
    .select()
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) {
    if (data.name.trim().length === 0)
      throw new ValidationError({ name: ['Channel name is required'] });
    if (data.name.length > 100)
      throw new ValidationError({ name: ['Channel name must be 100 characters or less'] });
    updates.name = data.name.trim();
    updates.slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  if (data.description !== undefined) updates.description = data.description.trim() || null;
  if (data.type !== undefined) updates.type = data.type;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.isArchived !== undefined) updates.isArchived = data.isArchived;

  const [updated] = await db
    .update(communityChannels)
    .set(updates)
    .where(eq(communityChannels.id, channelId))
    .returning();

  return updated;
}

export async function archiveChannel(channelId: string) {
  const [channel] = await db
    .select()
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');
  if (channel.isDefault) {
    throw new ValidationError({ channel: ['Cannot archive the default channel'] });
  }

  const [updated] = await db
    .update(communityChannels)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(communityChannels.id, channelId))
    .returning();

  return updated;
}

// ── Messages ────────────────────────────────────────────────

export async function sendMessage(
  channelId: string,
  userId: string,
  content: string,
  userRole: string,
  attachments?: Array<{
    type: string;
    url: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }>,
) {
  // Validate content
  const trimmed = content?.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new ValidationError({ content: ['Message content is required'] });
  }
  if (trimmed.length > 4000) {
    throw new ValidationError({ content: ['Message must be 4000 characters or less'] });
  }

  // Verify channel exists and is not archived
  const [channel] = await db
    .select()
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');
  if (channel.isArchived)
    throw new ValidationError({ channel: ['Cannot send messages to an archived channel'] });

  // Announcement channels: admin only
  if (channel.type === 'announcement' && userRole !== 'Administrator') {
    throw new ForbiddenError('Only administrators can post in announcement channels');
  }

  // Strip HTML tags for safety
  const sanitized = trimmed.replace(/<[^>]*>/g, '');

  // Insert message
  const [message] = await db
    .insert(communityMessages)
    .values({
      channelId,
      userId,
      content: sanitized,
      type: 'text',
    })
    .returning();

  // Insert attachments if provided
  let messageAttachments: Array<Record<string, unknown>> = [];
  if (attachments && attachments.length > 0) {
    const attachmentValues = attachments.map((att, idx) => ({
      messageId: message.id,
      type: att.type,
      url: att.url,
      fileName: att.fileName || null,
      fileSize: att.fileSize || null,
      mimeType: att.mimeType || null,
      sortOrder: idx,
    }));

    messageAttachments = await db
      .insert(communityMessageAttachments)
      .values(attachmentValues)
      .returning();
  }

  // Auto-join sender to channel if not already a member
  await db.insert(channelMembers).values({ channelId, userId }).onConflictDoNothing();

  // Fetch user info + avatar for broadcast
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

export async function getMessages(
  channelId: string,
  options: { before?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit || 50, 100);

  // Verify channel
  const [channel] = await db
    .select({ id: communityChannels.id })
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');

  // Build query with cursor pagination
  const conditions = [eq(communityMessages.channelId, channelId)];

  if (options.before) {
    // Get the created_at of the cursor message
    const [cursorMsg] = await db
      .select({ createdAt: communityMessages.createdAt })
      .from(communityMessages)
      .where(eq(communityMessages.id, options.before))
      .limit(1);

    if (cursorMsg) {
      conditions.push(lt(communityMessages.createdAt, cursorMsg.createdAt));
    }
  }

  const messages = await db
    .select({
      id: communityMessages.id,
      channelId: communityMessages.channelId,
      userId: communityMessages.userId,
      content: communityMessages.content,
      type: communityMessages.type,
      parentId: communityMessages.parentId,
      isEdited: communityMessages.isEdited,
      createdAt: communityMessages.createdAt,
      updatedAt: communityMessages.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: userProfiles.avatarUrl,
    })
    .from(communityMessages)
    .innerJoin(users, eq(communityMessages.userId, users.id))
    .leftJoin(userProfiles, eq(communityMessages.userId, userProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(communityMessages.createdAt))
    .limit(limit);

  // Fetch attachments for all messages in one query
  if (messages.length > 0) {
    const messageIds = messages.map((m) => m.id);
    const attachments = await db
      .select()
      .from(communityMessageAttachments)
      .where(
        sql`${communityMessageAttachments.messageId} IN (${sql.join(
          messageIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    // Fetch reactions grouped
    const reactions = await db
      .select({
        messageId: communityReactions.messageId,
        emoji: communityReactions.emoji,
        count: count(),
      })
      .from(communityReactions)
      .where(
        sql`${communityReactions.messageId} IN (${sql.join(
          messageIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .groupBy(communityReactions.messageId, communityReactions.emoji);

    const attachmentMap = new Map<string, Array<Record<string, unknown>>>();
    for (const att of attachments) {
      if (!attachmentMap.has(att.messageId)) attachmentMap.set(att.messageId, []);
      attachmentMap.get(att.messageId)!.push(att);
    }

    const reactionMap = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const r of reactions) {
      if (!reactionMap.has(r.messageId)) reactionMap.set(r.messageId, []);
      reactionMap.get(r.messageId)!.push({ emoji: r.emoji, count: Number(r.count) });
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
      reactions: reactionMap.get(m.id) || [],
    }));
  }

  return [];
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
  userRole: string,
) {
  const trimmed = content?.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new ValidationError({ content: ['Message content is required'] });
  }
  if (trimmed.length > 4000) {
    throw new ValidationError({ content: ['Message must be 4000 characters or less'] });
  }

  const [message] = await db
    .select()
    .from(communityMessages)
    .where(eq(communityMessages.id, messageId))
    .limit(1);

  if (!message) throw new NotFoundError('Message');
  if (message.userId !== userId && userRole !== 'Administrator') {
    throw new ForbiddenError('You can only edit your own messages');
  }

  const sanitized = trimmed.replace(/<[^>]*>/g, '');
  const [updated] = await db
    .update(communityMessages)
    .set({ content: sanitized, isEdited: true, updatedAt: new Date() })
    .where(eq(communityMessages.id, messageId))
    .returning();

  return updated;
}

export async function deleteMessage(messageId: string, userId: string, userRole: string) {
  const [message] = await db
    .select()
    .from(communityMessages)
    .where(eq(communityMessages.id, messageId))
    .limit(1);

  if (!message) throw new NotFoundError('Message');
  if (message.userId !== userId && userRole !== 'Administrator') {
    throw new ForbiddenError('You can only delete your own messages');
  }

  await db.delete(communityMessages).where(eq(communityMessages.id, messageId));
  return { id: messageId, channelId: message.channelId };
}

// ── Reactions ───────────────────────────────────────────────

export async function addReaction(messageId: string, userId: string, emoji: string) {
  if (!emoji || emoji.length > 32) {
    throw new ValidationError({ emoji: ['Emoji must be 1-32 characters'] });
  }

  const [message] = await db
    .select({ id: communityMessages.id })
    .from(communityMessages)
    .where(eq(communityMessages.id, messageId))
    .limit(1);

  if (!message) throw new NotFoundError('Message');

  await db.insert(communityReactions).values({ messageId, userId, emoji }).onConflictDoNothing();

  return getReactions(messageId);
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  await db
    .delete(communityReactions)
    .where(
      and(
        eq(communityReactions.messageId, messageId),
        eq(communityReactions.userId, userId),
        eq(communityReactions.emoji, emoji),
      ),
    );

  return getReactions(messageId);
}

export async function getReactions(messageId: string) {
  return db
    .select({
      emoji: communityReactions.emoji,
      count: count(),
    })
    .from(communityReactions)
    .where(eq(communityReactions.messageId, messageId))
    .groupBy(communityReactions.emoji);
}

// ── Channel Members ─────────────────────────────────────────

export async function joinChannel(channelId: string, userId: string) {
  const [channel] = await db
    .select({ id: communityChannels.id })
    .from(communityChannels)
    .where(eq(communityChannels.id, channelId))
    .limit(1);

  if (!channel) throw new NotFoundError('Channel');

  await db.insert(channelMembers).values({ channelId, userId }).onConflictDoNothing();

  return { channelId, userId };
}

export async function getChannelMembers(channelId: string) {
  return db
    .select({
      userId: channelMembers.userId,
      joinedAt: channelMembers.joinedAt,
      name: users.name,
      email: users.email,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .leftJoin(userProfiles, eq(channelMembers.userId, userProfiles.userId))
    .where(eq(channelMembers.channelId, channelId))
    .orderBy(users.name);
}

export async function getChannelMemberIds(channelId: string): Promise<string[]> {
  const members = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(eq(channelMembers.channelId, channelId));

  return members.map((m) => m.userId);
}

export async function getAllCommunityUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(eq(users.isBlocked, false))
    .orderBy(users.name);
}

// ── Unread Tracking ─────────────────────────────────────────

export async function updateLastRead(channelId: string, userId: string, messageId: string) {
  await db
    .update(channelMembers)
    .set({ lastReadMessageId: messageId })
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));
}

export async function getUnreadCounts(userId: string) {
  // Get all channels the user is a member of
  const memberships = await db
    .select({
      channelId: channelMembers.channelId,
      lastReadMessageId: channelMembers.lastReadMessageId,
    })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId));

  const counts: Array<{ channelId: string; unreadCount: number }> = [];

  for (const m of memberships) {
    let unreadCount: number;
    if (m.lastReadMessageId) {
      // Get created_at of last read message
      const [lastRead] = await db
        .select({ createdAt: communityMessages.createdAt })
        .from(communityMessages)
        .where(eq(communityMessages.id, m.lastReadMessageId))
        .limit(1);

      if (lastRead) {
        const [result] = await db
          .select({ count: count() })
          .from(communityMessages)
          .where(
            and(
              eq(communityMessages.channelId, m.channelId),
              sql`${communityMessages.createdAt} > ${lastRead.createdAt}`,
            ),
          );
        unreadCount = result?.count ?? 0;
      } else {
        unreadCount = 0;
      }
    } else {
      // Never read — count all messages
      const [result] = await db
        .select({ count: count() })
        .from(communityMessages)
        .where(eq(communityMessages.channelId, m.channelId));
      unreadCount = result?.count ?? 0;
    }

    if (unreadCount > 0) {
      counts.push({ channelId: m.channelId, unreadCount });
    }
  }

  return counts;
}

// ── Mark Read ──────────────────────────────────────────────

export async function markChannelRead(channelId: string, userId: string) {
  // Get the latest message in the channel
  const [latest] = await db
    .select({ id: communityMessages.id })
    .from(communityMessages)
    .where(eq(communityMessages.channelId, channelId))
    .orderBy(desc(communityMessages.createdAt))
    .limit(1);

  if (latest) {
    await updateLastRead(channelId, userId, latest.id);
  }

  return { channelId, read: true };
}
