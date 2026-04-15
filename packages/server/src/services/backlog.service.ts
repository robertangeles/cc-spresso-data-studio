import { db } from '../db/index.js';
import { backlogItems, backlogVotes, users } from '../db/schema.js';
import { eq, and, count, inArray } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../utils/errors.js';

/**
 * List backlog items with vote tallies and user's current vote.
 */
export async function listItems(
  userId: string,
  filters: { status?: string; category?: string } = {},
) {
  const conditions = [eq(backlogItems.isArchived, false)];
  if (filters.status) conditions.push(eq(backlogItems.status, filters.status));
  if (filters.category) conditions.push(eq(backlogItems.category, filters.category));

  const items = await db
    .select()
    .from(backlogItems)
    .where(and(...conditions))
    .orderBy(backlogItems.sortOrder);

  // Fetch vote tallies and user votes in batch
  const result = [];
  for (const item of items) {
    const [upvotes] = await db
      .select({ count: count() })
      .from(backlogVotes)
      .where(and(eq(backlogVotes.itemId, item.id), eq(backlogVotes.voteType, 'up')));

    const [downvotes] = await db
      .select({ count: count() })
      .from(backlogVotes)
      .where(and(eq(backlogVotes.itemId, item.id), eq(backlogVotes.voteType, 'down')));

    const [userVote] = await db
      .select({ voteType: backlogVotes.voteType })
      .from(backlogVotes)
      .where(and(eq(backlogVotes.itemId, item.id), eq(backlogVotes.userId, userId)))
      .limit(1);

    const up = Number(upvotes?.count ?? 0);
    const down = Number(downvotes?.count ?? 0);

    result.push({
      ...item,
      upvotes: up,
      downvotes: down,
      score: up - down,
      userVote: userVote?.voteType ?? null,
    });
  }

  // Sort by sortOrder first, then by score descending as tiebreaker
  result.sort((a, b) => a.sortOrder - b.sortOrder || b.score - a.score);
  return result;
}

export async function getItem(itemId: string, userId: string) {
  const [item] = await db.select().from(backlogItems).where(eq(backlogItems.id, itemId)).limit(1);

  if (!item) throw new NotFoundError('Backlog item');

  const [upvotes] = await db
    .select({ count: count() })
    .from(backlogVotes)
    .where(and(eq(backlogVotes.itemId, itemId), eq(backlogVotes.voteType, 'up')));

  const [downvotes] = await db
    .select({ count: count() })
    .from(backlogVotes)
    .where(and(eq(backlogVotes.itemId, itemId), eq(backlogVotes.voteType, 'down')));

  const [userVote] = await db
    .select({ voteType: backlogVotes.voteType })
    .from(backlogVotes)
    .where(and(eq(backlogVotes.itemId, itemId), eq(backlogVotes.userId, userId)))
    .limit(1);

  const up = Number(upvotes?.count ?? 0);
  const down = Number(downvotes?.count ?? 0);

  // Get creator info
  let creator = null;
  if (item.createdBy) {
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, item.createdBy))
      .limit(1);
    creator = user;
  }

  return {
    ...item,
    upvotes: up,
    downvotes: down,
    score: up - down,
    userVote: userVote?.voteType ?? null,
    creator,
  };
}

export async function createItem(
  data: {
    title: string;
    description?: string;
    status?: string;
    category?: string;
    sortOrder?: number;
  },
  userId: string,
) {
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError({ title: ['Title is required'] });
  }
  if (data.title.length > 255) {
    throw new ValidationError({ title: ['Title must be 255 characters or less'] });
  }

  const [item] = await db
    .insert(backlogItems)
    .values({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status || 'planned',
      category: data.category?.trim() || null,
      sortOrder: data.sortOrder ?? 0,
      createdBy: userId,
    })
    .returning();

  return item;
}

export async function updateItem(
  itemId: string,
  data: {
    title?: string;
    description?: string;
    status?: string;
    category?: string;
    sortOrder?: number;
    estimatedRelease?: string | null;
  },
) {
  const [item] = await db.select().from(backlogItems).where(eq(backlogItems.id, itemId)).limit(1);

  if (!item) throw new NotFoundError('Backlog item');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) {
    if (data.title.trim().length === 0) throw new ValidationError({ title: ['Title is required'] });
    if (data.title.length > 255)
      throw new ValidationError({ title: ['Title must be 255 characters or less'] });
    updates.title = data.title.trim();
  }
  if (data.description !== undefined) updates.description = data.description.trim() || null;
  if (data.status !== undefined) updates.status = data.status;
  if (data.category !== undefined) updates.category = data.category?.trim() || null;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.estimatedRelease !== undefined) updates.estimatedRelease = data.estimatedRelease;

  const [updated] = await db
    .update(backlogItems)
    .set(updates)
    .where(eq(backlogItems.id, itemId))
    .returning();

  return updated;
}

export async function archiveItem(itemId: string) {
  const [item] = await db.select().from(backlogItems).where(eq(backlogItems.id, itemId)).limit(1);

  if (!item) throw new NotFoundError('Backlog item');

  const [updated] = await db
    .update(backlogItems)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(backlogItems.id, itemId))
    .returning();

  return updated;
}

/**
 * Vote on a backlog item. Toggle semantics:
 * - Same vote again → removes the vote
 * - Different vote → switches the vote
 */
export async function vote(itemId: string, userId: string, voteType: string) {
  if (!['up', 'down'].includes(voteType)) {
    throw new ValidationError({ voteType: ['Must be "up" or "down"'] });
  }

  const [item] = await db.select().from(backlogItems).where(eq(backlogItems.id, itemId)).limit(1);

  if (!item) throw new NotFoundError('Backlog item');
  if (item.isArchived) {
    throw new ValidationError({ item: ['Cannot vote on archived items'] });
  }

  // Check for existing vote
  const [existing] = await db
    .select()
    .from(backlogVotes)
    .where(and(eq(backlogVotes.itemId, itemId), eq(backlogVotes.userId, userId)))
    .limit(1);

  if (existing) {
    if (existing.voteType === voteType) {
      // Same vote → toggle off (remove)
      await db.delete(backlogVotes).where(eq(backlogVotes.id, existing.id));
    } else {
      // Different vote → switch
      await db.update(backlogVotes).set({ voteType }).where(eq(backlogVotes.id, existing.id));
    }
  } else {
    // New vote
    await db.insert(backlogVotes).values({ itemId, userId, voteType });
  }

  // Return updated item with tallies
  return getItem(itemId, userId);
}

/**
 * Reorder items within a column. Accepts an ordered array of item IDs
 * and updates their sortOrder to match the array position.
 */
export async function reorderItems(itemIds: string[]) {
  if (!itemIds.length) return;

  // Validate all items exist
  const existingItems = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(inArray(backlogItems.id, itemIds));

  if (existingItems.length !== itemIds.length) {
    throw new ValidationError({ items: ['One or more item IDs are invalid'] });
  }

  // Update sortOrder for each item based on its position in the array
  await Promise.all(
    itemIds.map((id, index) =>
      db
        .update(backlogItems)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(backlogItems.id, id)),
    ),
  );
}

export async function removeVote(itemId: string, userId: string) {
  const [item] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(eq(backlogItems.id, itemId))
    .limit(1);

  if (!item) throw new NotFoundError('Backlog item');

  await db
    .delete(backlogVotes)
    .where(and(eq(backlogVotes.itemId, itemId), eq(backlogVotes.userId, userId)));

  return getItem(itemId, userId);
}
