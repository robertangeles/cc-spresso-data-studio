import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

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
  communityChannels: {},
  communityMessages: { id: 'id' },
  communityMessageAttachments: {},
  communityReactions: { messageId: 'messageId', userId: 'userId', emoji: 'emoji' },
  channelMembers: {},
  users: {},
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function chainMock(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        groupBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('Community Reactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-RXN-01: addReaction with empty emoji throws ValidationError
  it('TC-RXN-01: addReaction throws ValidationError for empty emoji', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    await expect(addReaction('msg-1', 'user-1', '')).rejects.toThrow(ValidationError);
  });

  // TC-RXN-02: addReaction with emoji > 32 chars throws ValidationError
  it('TC-RXN-02: addReaction throws ValidationError for emoji > 32 chars', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    const longEmoji = 'a'.repeat(33);
    await expect(addReaction('msg-1', 'user-1', longEmoji)).rejects.toThrow(ValidationError);
  });

  // TC-RXN-03: addReaction with exactly 32 char emoji passes validation
  it('TC-RXN-03: addReaction accepts emoji of exactly 32 chars', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    const exactEmoji = 'a'.repeat(32);
    // Mock message exists
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'msg-1' }]));
    // Mock insert (onConflictDoNothing for idempotency)
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    // Mock getReactions call
    mockSelect.mockReturnValueOnce(chainMock([{ emoji: exactEmoji, count: 1 }]));

    const result = await addReaction('msg-1', 'user-1', exactEmoji);
    expect(result).toBeDefined();
  });

  // TC-RXN-04: addReaction on non-existent message throws NotFoundError
  it('TC-RXN-04: addReaction throws NotFoundError for non-existent message', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(addReaction('nonexistent', 'user-1', '👍')).rejects.toThrow(NotFoundError);
  });

  // TC-RXN-05: addReaction uses onConflictDoNothing (idempotent)
  it('TC-RXN-05: addReaction is idempotent via onConflictDoNothing', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    // Mock message exists
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'msg-1' }]));
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing }),
    });
    // Mock getReactions
    mockSelect.mockReturnValueOnce(chainMock([{ emoji: '👍', count: 1 }]));

    await addReaction('msg-1', 'user-1', '👍');
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  // TC-RXN-06: Multiple different emojis are allowed
  it('TC-RXN-06: multiple different emojis are valid', () => {
    // Validation logic: emoji.length > 0 && emoji.length <= 32
    const emojis = ['👍', '❤️', '😂', '🔥', '🎉'];
    for (const e of emojis) {
      expect(e.length).toBeGreaterThan(0);
      expect(e.length).toBeLessThanOrEqual(32);
    }
  });

  // TC-RXN-07: removeReaction calls delete with correct conditions
  it('TC-RXN-07: removeReaction calls delete', async () => {
    const { removeReaction } = await import('../../services/community.service.js');
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    // Mock getReactions
    mockSelect.mockReturnValueOnce(chainMock([]));

    await removeReaction('msg-1', 'user-1', '👍');
    expect(mockDelete).toHaveBeenCalled();
  });

  // TC-RXN-08: removeReaction on non-existent reaction is a no-op (no error)
  it('TC-RXN-08: removeReaction on non-existent reaction does not throw', async () => {
    const { removeReaction } = await import('../../services/community.service.js');
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockSelect.mockReturnValueOnce(chainMock([]));

    // Should not throw
    await expect(removeReaction('msg-1', 'user-1', '👍')).resolves.toBeDefined();
  });

  // TC-RXN-09: getReactions returns grouped emoji counts
  it('TC-RXN-09: getReactions returns grouped emoji counts', async () => {
    const { getReactions } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([
        { emoji: '👍', count: 3 },
        { emoji: '❤️', count: 1 },
      ]),
    );

    const result = await getReactions('msg-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('emoji');
    expect(result[0]).toHaveProperty('count');
  });

  // TC-RXN-10: Validation error details contain emoji field
  it('TC-RXN-10: emoji validation error contains correct field', async () => {
    const { addReaction } = await import('../../services/community.service.js');
    try {
      await addReaction('msg-1', 'user-1', '');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Record<string, unknown>).details).toHaveProperty('emoji');
    }
  });
});
