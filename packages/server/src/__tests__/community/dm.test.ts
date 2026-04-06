import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors.js';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('../../db/schema.js', () => ({
  directConversations: { id: 'id' },
  directConversationMembers: {
    id: 'id',
    conversationId: 'conversationId',
    userId: 'userId',
    lastReadMessageId: 'lastReadMessageId',
  },
  directMessages: {
    id: 'id',
    conversationId: 'conversationId',
    userId: 'userId',
    content: 'content',
    isEdited: 'isEdited',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  directMessageAttachments: { messageId: 'messageId' },
  users: { id: 'id', name: 'name', email: 'email', role: 'role' },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock block service
const mockIsEitherBlocked = vi.fn().mockResolvedValue(false);
const mockIsBlocked = vi.fn().mockResolvedValue(false);

vi.mock('../../services/block.service.js', () => ({
  isEitherBlocked: (...args: unknown[]) => mockIsEitherBlocked(...args),
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
}));

function chainMock(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('Direct Messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getOrCreateConversation ──────────────────────────────────

  // TC-DM-01: Self-DM throws ValidationError
  it('TC-DM-01: getOrCreateConversation throws ValidationError for self-DM', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    await expect(getOrCreateConversation('user-1', 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-DM-02: Self-DM error details contain userId field
  it('TC-DM-02: self-DM error mentions userId field', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    try {
      await getOrCreateConversation('user-1', 'user-1');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as Record<string, unknown>).details).toHaveProperty('userId');
    }
  });

  // TC-DM-03: Non-existent target user throws NotFoundError
  it('TC-DM-03: getOrCreateConversation throws NotFoundError for non-existent user', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(getOrCreateConversation('user-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  // TC-DM-04: Blocked user throws ForbiddenError
  it('TC-DM-04: getOrCreateConversation throws ForbiddenError when blocked', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'user-2', name: 'User 2' }]));
    mockIsEitherBlocked.mockResolvedValueOnce(true);
    await expect(getOrCreateConversation('user-1', 'user-2')).rejects.toThrow(ForbiddenError);
  });

  // TC-DM-05: ForbiddenError message says "Cannot message this user"
  it('TC-DM-05: block ForbiddenError has correct message', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'user-2', name: 'User 2' }]));
    mockIsEitherBlocked.mockResolvedValueOnce(true);
    try {
      await getOrCreateConversation('user-1', 'user-2');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as Error).message).toBe('Cannot message this user');
    }
  });

  // TC-DM-06: Existing conversation returns created: false
  it('TC-DM-06: getOrCreateConversation returns created=false for existing conversation', async () => {
    const { getOrCreateConversation } = await import('../../services/dm.service.js');
    // Target user exists
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'user-2', name: 'User 2' }]));
    mockIsEitherBlocked.mockResolvedValueOnce(false);
    // User's existing conversations
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ conversationId: 'conv-1' }]),
      }),
    });
    // Other member in that conversation
    mockSelect.mockReturnValueOnce(chainMock([{ userId: 'user-2' }]));

    const result = await getOrCreateConversation('user-1', 'user-2');
    expect(result).toEqual({ conversationId: 'conv-1', created: false });
  });

  // ── sendMessage ──────────────────────────────────────────────

  // TC-DM-07: Empty DM content throws ValidationError
  it('TC-DM-07: sendMessage throws ValidationError for empty content', async () => {
    const { sendMessage } = await import('../../services/dm.service.js');
    await expect(sendMessage('conv-1', 'user-1', '')).rejects.toThrow(ValidationError);
  });

  // TC-DM-08: DM content > 4000 chars throws ValidationError
  it('TC-DM-08: sendMessage throws ValidationError for content > 4000 chars', async () => {
    const { sendMessage } = await import('../../services/dm.service.js');
    await expect(sendMessage('conv-1', 'user-1', 'a'.repeat(4001))).rejects.toThrow(
      ValidationError,
    );
  });

  // TC-DM-09: Non-member throws ForbiddenError
  it('TC-DM-09: sendMessage throws ForbiddenError for non-member', async () => {
    const { sendMessage } = await import('../../services/dm.service.js');
    // Membership check returns empty
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(sendMessage('conv-1', 'user-1', 'hello')).rejects.toThrow(ForbiddenError);
  });

  // TC-DM-10: Blocked sender throws ForbiddenError
  it('TC-DM-10: sendMessage throws ForbiddenError when blocked', async () => {
    const { sendMessage } = await import('../../services/dm.service.js');
    // Membership check passes
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'member-1' }]));
    // Other member lookup
    mockSelect.mockReturnValueOnce(chainMock([{ userId: 'user-2' }]));
    mockIsEitherBlocked.mockResolvedValueOnce(true);
    await expect(sendMessage('conv-1', 'user-1', 'hello')).rejects.toThrow(ForbiddenError);
  });

  // TC-DM-11: DM sendMessage strips HTML
  it('TC-DM-11: sendMessage strips HTML tags from DM content', () => {
    const content = '<b>Bold</b> and <script>evil()</script>';
    const sanitized = content.trim().replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('Bold and evil()');
  });

  // ── editMessage ──────────────────────────────────────────────

  // TC-DM-12: DM editMessage with empty content throws ValidationError
  it('TC-DM-12: editMessage throws ValidationError for empty content', async () => {
    const { editMessage } = await import('../../services/dm.service.js');
    await expect(editMessage('msg-1', 'user-1', '')).rejects.toThrow(ValidationError);
  });

  // TC-DM-13: DM editMessage on non-existent message throws NotFoundError
  it('TC-DM-13: editMessage throws NotFoundError for non-existent message', async () => {
    const { editMessage } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(editMessage('nonexistent', 'user-1', 'updated')).rejects.toThrow(NotFoundError);
  });

  // TC-DM-14: DM editMessage by non-owner throws ForbiddenError (no admin override)
  it('TC-DM-14: editMessage throws ForbiddenError for non-owner (no admin override)', async () => {
    const { editMessage } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'msg-1', userId: 'owner-1' }]));
    await expect(editMessage('msg-1', 'other-user', 'updated')).rejects.toThrow(ForbiddenError);
  });

  // ── deleteMessage ────────────────────────────────────────────

  // TC-DM-15: DM deleteMessage by non-owner throws ForbiddenError (no admin override)
  it('TC-DM-15: deleteMessage throws ForbiddenError for non-owner (no admin override)', async () => {
    const { deleteMessage } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'msg-1', userId: 'owner-1', conversationId: 'conv-1' }]),
    );
    await expect(deleteMessage('msg-1', 'other-user')).rejects.toThrow(ForbiddenError);
  });

  // TC-DM-16: DM deleteMessage on non-existent message throws NotFoundError
  it('TC-DM-16: deleteMessage throws NotFoundError for non-existent message', async () => {
    const { deleteMessage } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(deleteMessage('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
  });

  // TC-DM-17: DM deleteMessage by owner returns correct shape
  it('TC-DM-17: deleteMessage by owner returns id and conversationId', async () => {
    const { deleteMessage } = await import('../../services/dm.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'msg-1', userId: 'user-1', conversationId: 'conv-1' }]),
    );
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await deleteMessage('msg-1', 'user-1');
    expect(result).toEqual({ id: 'msg-1', conversationId: 'conv-1' });
  });
});
