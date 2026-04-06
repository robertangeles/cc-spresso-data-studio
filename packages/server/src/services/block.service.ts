import { db } from '../db/index.js';
import { userBlocks, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ValidationError } from '../utils/errors.js';

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new ValidationError({ userId: ['You cannot block yourself'] });
  }

  // Prevent blocking admins
  const [targetUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, blockedId))
    .limit(1);

  if (targetUser?.role === 'Administrator') {
    throw new ValidationError({ userId: ['You cannot block an administrator'] });
  }

  await db.insert(userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();

  return { blockerId, blockedId };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));

  return { blockerId, blockedId };
}

/**
 * Check if userA has blocked userB (directional).
 */
export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const [block] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
    .limit(1);

  return !!block;
}

/**
 * Check if either user has blocked the other (bidirectional check for DMs).
 */
export async function isEitherBlocked(userIdA: string, userIdB: string): Promise<boolean> {
  const aBlocksB = await isBlocked(userIdA, userIdB);
  if (aBlocksB) return true;
  return isBlocked(userIdB, userIdA);
}

export async function getBlockedUsers(blockerId: string) {
  return db
    .select({
      id: userBlocks.id,
      blockedId: userBlocks.blockedId,
      createdAt: userBlocks.createdAt,
      blockedName: users.name,
      blockedEmail: users.email,
    })
    .from(userBlocks)
    .innerJoin(users, eq(userBlocks.blockedId, users.id))
    .where(eq(userBlocks.blockerId, blockerId))
    .orderBy(users.name);
}
