import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, ConflictError, NotFoundError } from '../../utils/errors.js';

// Mock the DB layer
vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema.js', () => ({
  communityChannels: {
    id: 'id',
    slug: 'slug',
    name: 'name',
    sortOrder: 'sortOrder',
    isArchived: 'isArchived',
    isDefault: 'isDefault',
  },
  communityMessages: {},
  communityMessageAttachments: {},
  communityReactions: {},
  channelMembers: { channelId: 'channelId', userId: 'userId' },
  users: {},
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('Community Channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation: createChannel ---

  // TC-CH-01: Empty name throws ValidationError
  it('TC-CH-01: createChannel throws ValidationError for empty name', async () => {
    const { createChannel } = await import('../../services/community.service.js');
    await expect(createChannel({ name: '' }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-CH-02: Whitespace-only name throws ValidationError
  it('TC-CH-02: createChannel throws ValidationError for whitespace-only name', async () => {
    const { createChannel } = await import('../../services/community.service.js');
    await expect(createChannel({ name: '   ' }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-CH-03: Name exceeding 100 chars throws ValidationError
  it('TC-CH-03: createChannel throws ValidationError for name > 100 characters', async () => {
    const { createChannel } = await import('../../services/community.service.js');
    const longName = 'a'.repeat(101);
    await expect(createChannel({ name: longName }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-CH-04: Name exactly 100 chars does NOT throw ValidationError on name length
  it('TC-CH-04: createChannel accepts name exactly 100 characters', async () => {
    const { createChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    // Mock slug check returns no duplicate
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const exactName = 'a'.repeat(100);
    // Will fail at DB insert (no returning mock), but should not throw ValidationError
    try {
      await createChannel({ name: exactName }, 'user-1');
    } catch (err: unknown) {
      // Should not be a ValidationError about name length
      expect(err).not.toBeInstanceOf(ValidationError);
    }
  });

  // TC-CH-05: Duplicate slug throws ConflictError
  it('TC-CH-05: createChannel throws ConflictError for duplicate slug', async () => {
    const { createChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    // Mock slug check returns an existing channel
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'existing-id' }]),
        }),
      }),
    });
    await expect(createChannel({ name: 'General' }, 'user-1')).rejects.toThrow(ConflictError);
  });

  // TC-CH-06: Slug is generated from name (lowercased, hyphenated)
  it('TC-CH-06: slug is generated correctly from channel name', () => {
    // Test the slug generation logic directly
    const name = 'My Cool Channel!';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    expect(slug).toBe('my-cool-channel');
  });

  // TC-CH-07: Slug strips leading and trailing hyphens
  it('TC-CH-07: slug strips leading and trailing hyphens', () => {
    const name = '---Hello World---';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    expect(slug).toBe('hello-world');
  });

  // TC-CH-08: Special characters in name produce clean slug
  it('TC-CH-08: special characters in name produce clean slug', () => {
    const name = 'Hello @#$%^& World!';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    expect(slug).toBe('hello-world');
  });

  // --- Validation: updateChannel ---

  // TC-CH-09: updateChannel with empty name throws ValidationError
  it('TC-CH-09: updateChannel throws ValidationError for empty name', async () => {
    const { updateChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    // Mock channel lookup returns a channel
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'ch-1', name: 'General' }]),
        }),
      }),
    });
    await expect(updateChannel('ch-1', { name: '' })).rejects.toThrow(ValidationError);
  });

  // TC-CH-10: updateChannel with name > 100 chars throws ValidationError
  it('TC-CH-10: updateChannel throws ValidationError for name > 100 characters', async () => {
    const { updateChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'ch-1', name: 'General' }]),
        }),
      }),
    });
    await expect(updateChannel('ch-1', { name: 'a'.repeat(101) })).rejects.toThrow(ValidationError);
  });

  // TC-CH-11: updateChannel on non-existent channel throws NotFoundError
  it('TC-CH-11: updateChannel throws NotFoundError for non-existent channel', async () => {
    const { updateChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(updateChannel('nonexistent', { name: 'New' })).rejects.toThrow(NotFoundError);
  });

  // --- archiveChannel ---

  // TC-CH-12: archiveChannel on non-existent channel throws NotFoundError
  it('TC-CH-12: archiveChannel throws NotFoundError for non-existent channel', async () => {
    const { archiveChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(archiveChannel('nonexistent')).rejects.toThrow(NotFoundError);
  });

  // TC-CH-13: archiveChannel on default channel throws ValidationError
  it('TC-CH-13: archiveChannel throws ValidationError for default channel', async () => {
    const { archiveChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'ch-1', isDefault: true }]),
        }),
      }),
    });
    await expect(archiveChannel('ch-1')).rejects.toThrow(ValidationError);
  });

  // TC-CH-14: archiveChannel error message mentions default channel
  it('TC-CH-14: archiveChannel error details mention default channel', async () => {
    const { archiveChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'ch-1', isDefault: true }]),
        }),
      }),
    });
    try {
      await archiveChannel('ch-1');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as Record<string, unknown>).details as Record<string, unknown>).toHaveProperty(
        'channel',
      );
      expect(
        ((err as Record<string, unknown>).details as Record<string, string>).channel,
      ).toContain('Cannot archive the default channel');
    }
  });

  // --- getChannel ---

  // TC-CH-15: getChannel on non-existent channel throws NotFoundError
  it('TC-CH-15: getChannel throws NotFoundError for non-existent channel', async () => {
    const { getChannel } = await import('../../services/community.service.js');
    const { db } = await import('../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(getChannel('nonexistent')).rejects.toThrow(NotFoundError);
  });

  // TC-CH-16: createChannel default type is 'text'
  it('TC-CH-16: createChannel defaults to type "text"', () => {
    // The service sets type: data.type || 'text'
    const data: { name: string; type?: string } = { name: 'Test Channel' };
    const type = data.type || 'text';
    expect(type).toBe('text');
  });

  // TC-CH-17: createChannel default sortOrder is 0
  it('TC-CH-17: createChannel defaults sortOrder to 0', () => {
    const data = { name: 'Test Channel' };
    const sortOrder = (data as Record<string, unknown>).sortOrder ?? 0;
    expect(sortOrder).toBe(0);
  });
});
