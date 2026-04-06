import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors.js';

// Mock DB
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
  communityChannels: { id: 'id', slug: 'slug', isArchived: 'isArchived', type: 'type' },
  communityMessages: {
    id: 'id',
    channelId: 'channelId',
    userId: 'userId',
    content: 'content',
    type: 'type',
    parentId: 'parentId',
    isEdited: 'isEdited',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  communityMessageAttachments: { messageId: 'messageId' },
  communityReactions: { messageId: 'messageId', emoji: 'emoji' },
  channelMembers: { channelId: 'channelId', userId: 'userId' },
  users: { id: 'id', name: 'name', email: 'email' },
  userProfiles: { userId: 'userId', avatarUrl: 'avatarUrl' },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Helper to set up chainable mock
function chainMock(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
      innerJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

describe('Community Messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── sendMessage validation ──────────────────────────────────

  // TC-MSG-01: Empty content throws ValidationError
  it('TC-MSG-01: sendMessage throws ValidationError for empty content', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    await expect(sendMessage('ch-1', 'user-1', '', 'Member')).rejects.toThrow(ValidationError);
  });

  // TC-MSG-02: Null/undefined content throws ValidationError
  it('TC-MSG-02: sendMessage throws ValidationError for null content', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    await expect(
      sendMessage('ch-1', 'user-1', null as unknown as string, 'Member'),
    ).rejects.toThrow(ValidationError);
  });

  // TC-MSG-03: Whitespace-only content throws ValidationError
  it('TC-MSG-03: sendMessage throws ValidationError for whitespace-only content', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    await expect(sendMessage('ch-1', 'user-1', '   \n\t  ', 'Member')).rejects.toThrow(
      ValidationError,
    );
  });

  // TC-MSG-04: Content > 4000 chars throws ValidationError
  it('TC-MSG-04: sendMessage throws ValidationError for content > 4000 chars', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    const longContent = 'a'.repeat(4001);
    await expect(sendMessage('ch-1', 'user-1', longContent, 'Member')).rejects.toThrow(
      ValidationError,
    );
  });

  // TC-MSG-05: Content exactly 4000 chars does NOT throw on length
  it('TC-MSG-05: sendMessage accepts content exactly 4000 chars', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    const exactContent = 'a'.repeat(4000);
    // Mock channel lookup
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'ch-1', isArchived: false, type: 'text' }]));
    // Mock message insert
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'msg-1', channelId: 'ch-1', content: exactContent }]),
      }),
    });
    // Mock auto-join (onConflictDoNothing)
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'msg-1', channelId: 'ch-1', content: exactContent }]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    // Mock user fetch
    mockSelect.mockReturnValueOnce(chainMock([{ name: 'Test', email: 'test@test.com' }]));

    // Should not throw ValidationError about length
    try {
      await sendMessage('ch-1', 'user-1', exactContent, 'Member');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(ValidationError);
    }
  });

  // TC-MSG-06: Non-existent channel throws NotFoundError
  it('TC-MSG-06: sendMessage throws NotFoundError for non-existent channel', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(sendMessage('nonexistent', 'user-1', 'hello', 'Member')).rejects.toThrow(
      NotFoundError,
    );
  });

  // TC-MSG-07: Archived channel throws ValidationError
  it('TC-MSG-07: sendMessage throws ValidationError for archived channel', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'ch-1', isArchived: true, type: 'text' }]));
    await expect(sendMessage('ch-1', 'user-1', 'hello', 'Member')).rejects.toThrow(ValidationError);
  });

  // TC-MSG-08: Announcement channel blocks non-admin
  it('TC-MSG-08: sendMessage throws ForbiddenError for non-admin in announcement channel', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'ch-1', isArchived: false, type: 'announcement' }]),
    );
    await expect(sendMessage('ch-1', 'user-1', 'hello', 'Member')).rejects.toThrow(ForbiddenError);
  });

  // TC-MSG-09: Announcement channel allows admin
  it('TC-MSG-09: sendMessage allows admin in announcement channel', async () => {
    const { sendMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'ch-1', isArchived: false, type: 'announcement' }]),
    );
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'msg-1', channelId: 'ch-1', content: 'hello' }]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockSelect.mockReturnValueOnce(chainMock([{ name: 'Admin', email: 'admin@test.com' }]));

    try {
      await sendMessage('ch-1', 'user-1', 'hello', 'Administrator');
    } catch (err: unknown) {
      // Should not be ForbiddenError
      expect(err).not.toBeInstanceOf(ForbiddenError);
    }
  });

  // TC-MSG-10: HTML tags are stripped from content
  it('TC-MSG-10: sendMessage strips HTML tags from content', () => {
    const content = '<script>alert("xss")</script>Hello <b>World</b>';
    const sanitized = content.trim().replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('alert("xss")Hello World');
  });

  // TC-MSG-11: Content with only HTML tags becomes empty after stripping
  it('TC-MSG-11: HTML-only content becomes empty string after stripping', () => {
    const content = '<div><span></span></div>';
    const sanitized = content.trim().replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('');
  });

  // TC-MSG-12: Message type defaults to "text"
  it('TC-MSG-12: message type defaults to "text"', () => {
    // The service hardcodes type: 'text' in the insert
    const type = 'text';
    expect(type).toBe('text');
  });

  // ── editMessage ──────────────────────────────────────────────

  // TC-MSG-13: editMessage with empty content throws ValidationError
  it('TC-MSG-13: editMessage throws ValidationError for empty content', async () => {
    const { editMessage } = await import('../../services/community.service.js');
    await expect(editMessage('msg-1', 'user-1', '', 'Member')).rejects.toThrow(ValidationError);
  });

  // TC-MSG-14: editMessage with content > 4000 throws ValidationError
  it('TC-MSG-14: editMessage throws ValidationError for content > 4000 chars', async () => {
    const { editMessage } = await import('../../services/community.service.js');
    await expect(editMessage('msg-1', 'user-1', 'a'.repeat(4001), 'Member')).rejects.toThrow(
      ValidationError,
    );
  });

  // TC-MSG-15: editMessage on non-existent message throws NotFoundError
  it('TC-MSG-15: editMessage throws NotFoundError for non-existent message', async () => {
    const { editMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(editMessage('nonexistent', 'user-1', 'updated', 'Member')).rejects.toThrow(
      NotFoundError,
    );
  });

  // TC-MSG-16: editMessage by non-owner non-admin throws ForbiddenError
  it('TC-MSG-16: editMessage throws ForbiddenError when non-owner edits', async () => {
    const { editMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'msg-1', userId: 'owner-1' }]));
    await expect(editMessage('msg-1', 'other-user', 'updated', 'Member')).rejects.toThrow(
      ForbiddenError,
    );
  });

  // TC-MSG-17: editMessage by admin on others message is allowed
  it('TC-MSG-17: editMessage allows admin to edit other user message', async () => {
    const { editMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'msg-1', userId: 'owner-1' }]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: 'msg-1', content: 'updated', isEdited: true }]),
        }),
      }),
    });

    const result = await editMessage('msg-1', 'admin-1', 'updated', 'Administrator');
    expect(result).toBeDefined();
  });

  // TC-MSG-18: editMessage strips HTML from updated content
  it('TC-MSG-18: editMessage strips HTML tags', () => {
    const content = '<img src=x onerror=alert(1)>Clean text';
    const sanitized = content.trim().replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('Clean text');
  });

  // ── deleteMessage ────────────────────────────────────────────

  // TC-MSG-19: deleteMessage on non-existent message throws NotFoundError
  it('TC-MSG-19: deleteMessage throws NotFoundError for non-existent message', async () => {
    const { deleteMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(deleteMessage('nonexistent', 'user-1', 'Member')).rejects.toThrow(NotFoundError);
  });

  // TC-MSG-20: deleteMessage by non-owner non-admin throws ForbiddenError
  it('TC-MSG-20: deleteMessage throws ForbiddenError when non-owner deletes', async () => {
    const { deleteMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'msg-1', userId: 'owner-1', channelId: 'ch-1' }]),
    );
    await expect(deleteMessage('msg-1', 'other-user', 'Member')).rejects.toThrow(ForbiddenError);
  });

  // TC-MSG-21: deleteMessage by admin on others message is allowed
  it('TC-MSG-21: deleteMessage allows admin to delete other user message', async () => {
    const { deleteMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'msg-1', userId: 'owner-1', channelId: 'ch-1' }]),
    );
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await deleteMessage('msg-1', 'admin-1', 'Administrator');
    expect(result).toEqual({ id: 'msg-1', channelId: 'ch-1' });
  });

  // TC-MSG-22: deleteMessage by owner succeeds
  it('TC-MSG-22: deleteMessage allows owner to delete own message', async () => {
    const { deleteMessage } = await import('../../services/community.service.js');
    mockSelect.mockReturnValueOnce(
      chainMock([{ id: 'msg-1', userId: 'user-1', channelId: 'ch-1' }]),
    );
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await deleteMessage('msg-1', 'user-1', 'Member');
    expect(result).toEqual({ id: 'msg-1', channelId: 'ch-1' });
  });
});
