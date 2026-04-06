import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError } from '../../utils/errors.js';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('../../db/schema.js', () => ({
  userBlocks: { id: 'id', blockerId: 'blockerId', blockedId: 'blockedId', createdAt: 'createdAt' },
  users: { id: 'id', name: 'name', email: 'email', role: 'role' },
}));

function chainMock(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

describe('Block Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-BLK-01: Self-block throws ValidationError
  it('TC-BLK-01: blockUser throws ValidationError for self-block', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    await expect(blockUser('user-1', 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-BLK-02: Self-block error details contain userId field
  it('TC-BLK-02: self-block error details mention userId', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    try {
      await blockUser('user-1', 'user-1');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as Record<string, unknown>).details).toHaveProperty('userId');
      expect(((err as Record<string, unknown>).details as Record<string, string>).userId).toContain(
        'You cannot block yourself',
      );
    }
  });

  // TC-BLK-03: Blocking an admin throws ValidationError
  it('TC-BLK-03: blockUser throws ValidationError for admin target', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ role: 'Administrator' }]));
    await expect(blockUser('user-1', 'admin-1')).rejects.toThrow(ValidationError);
  });

  // TC-BLK-04: Admin block error mentions administrator
  it('TC-BLK-04: admin block error mentions administrator', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ role: 'Administrator' }]));
    try {
      await blockUser('user-1', 'admin-1');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(((err as Record<string, unknown>).details as Record<string, string>).userId).toContain(
        'You cannot block an administrator',
      );
    }
  });

  // TC-BLK-05: Blocking a non-admin user succeeds
  it('TC-BLK-05: blockUser succeeds for non-admin target', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ role: 'Member' }]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await blockUser('user-1', 'user-2');
    expect(result).toEqual({ blockerId: 'user-1', blockedId: 'user-2' });
  });

  // TC-BLK-06: Blocking is idempotent (onConflictDoNothing)
  it('TC-BLK-06: blockUser is idempotent via onConflictDoNothing', async () => {
    const { blockUser } = await import('../../services/block.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ role: 'Member' }]));
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing }),
    });

    await blockUser('user-1', 'user-2');
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  // TC-BLK-07: unblockUser returns correct shape
  it('TC-BLK-07: unblockUser returns blockerId and blockedId', async () => {
    const { unblockUser } = await import('../../services/block.service.js');
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await unblockUser('user-1', 'user-2');
    expect(result).toEqual({ blockerId: 'user-1', blockedId: 'user-2' });
  });

  // TC-BLK-08: isBlocked is directional (A blocks B, not B blocks A)
  it('TC-BLK-08: isBlocked is directional', async () => {
    const { isBlocked } = await import('../../services/block.service.js');
    // A blocks B
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'block-1' }]));
    const aBlocksB = await isBlocked('user-a', 'user-b');
    expect(aBlocksB).toBe(true);

    // B does not block A
    mockSelect.mockReturnValueOnce(chainMock([]));
    const bBlocksA = await isBlocked('user-b', 'user-a');
    expect(bBlocksA).toBe(false);
  });

  // TC-BLK-09: isEitherBlocked checks both directions
  it('TC-BLK-09: isEitherBlocked returns true if either direction is blocked', async () => {
    const { isEitherBlocked } = await import('../../services/block.service.js');
    // First direction: not blocked
    mockSelect.mockReturnValueOnce(chainMock([]));
    // Second direction: blocked
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'block-1' }]));

    const result = await isEitherBlocked('user-a', 'user-b');
    expect(result).toBe(true);
  });
});
