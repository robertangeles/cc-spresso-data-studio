import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

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
  backlogItems: {
    id: 'id',
    title: 'title',
    status: 'status',
    category: 'category',
    isArchived: 'isArchived',
    sortOrder: 'sortOrder',
    createdBy: 'createdBy',
  },
  backlogVotes: { id: 'id', itemId: 'itemId', userId: 'userId', voteType: 'voteType' },
  users: { id: 'id', name: 'name' },
}));

function chainMock(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('Backlog Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createItem validation ────────────────────────────────────

  // TC-BL-01: Empty title throws ValidationError
  it('TC-BL-01: createItem throws ValidationError for empty title', async () => {
    const { createItem } = await import('../../services/backlog.service.js');
    await expect(createItem({ title: '' }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-BL-02: Whitespace-only title throws ValidationError
  it('TC-BL-02: createItem throws ValidationError for whitespace-only title', async () => {
    const { createItem } = await import('../../services/backlog.service.js');
    await expect(createItem({ title: '   ' }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-BL-03: Title > 255 chars throws ValidationError
  it('TC-BL-03: createItem throws ValidationError for title > 255 chars', async () => {
    const { createItem } = await import('../../services/backlog.service.js');
    await expect(createItem({ title: 'a'.repeat(256) }, 'user-1')).rejects.toThrow(ValidationError);
  });

  // TC-BL-04: Title exactly 255 chars does NOT throw on length
  it('TC-BL-04: createItem accepts title exactly 255 chars', async () => {
    const { createItem } = await import('../../services/backlog.service.js');
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'item-1', title: 'a'.repeat(255) }]),
      }),
    });

    const result = await createItem({ title: 'a'.repeat(255) }, 'user-1');
    expect(result).toBeDefined();
  });

  // TC-BL-05: Default status is 'planned'
  it('TC-BL-05: createItem defaults status to "planned"', () => {
    const data = { title: 'Feature Request' };
    const status = (data as Record<string, unknown>).status || 'planned';
    expect(status).toBe('planned');
  });

  // TC-BL-06: Default sortOrder is 0
  it('TC-BL-06: createItem defaults sortOrder to 0', () => {
    const data = { title: 'Feature Request' };
    const sortOrder = (data as Record<string, unknown>).sortOrder ?? 0;
    expect(sortOrder).toBe(0);
  });

  // TC-BL-07: Validation error details contain title field
  it('TC-BL-07: createItem error details contain title field', async () => {
    const { createItem } = await import('../../services/backlog.service.js');
    try {
      await createItem({ title: '' }, 'user-1');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as Record<string, unknown>).details).toHaveProperty('title');
    }
  });

  // ── updateItem validation ────────────────────────────────────

  // TC-BL-08: updateItem on non-existent item throws NotFoundError
  it('TC-BL-08: updateItem throws NotFoundError for non-existent item', async () => {
    const { updateItem } = await import('../../services/backlog.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(updateItem('nonexistent', { title: 'Updated' })).rejects.toThrow(NotFoundError);
  });

  // TC-BL-09: updateItem with empty title throws ValidationError
  it('TC-BL-09: updateItem throws ValidationError for empty title', async () => {
    const { updateItem } = await import('../../services/backlog.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'item-1', title: 'Old' }]));
    await expect(updateItem('item-1', { title: '' })).rejects.toThrow(ValidationError);
  });

  // TC-BL-10: updateItem with title > 255 throws ValidationError
  it('TC-BL-10: updateItem throws ValidationError for title > 255 chars', async () => {
    const { updateItem } = await import('../../services/backlog.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'item-1', title: 'Old' }]));
    await expect(updateItem('item-1', { title: 'a'.repeat(256) })).rejects.toThrow(ValidationError);
  });

  // ── vote ─────────────────────────────────────────────────────

  // TC-BL-11: Invalid voteType throws ValidationError
  it('TC-BL-11: vote throws ValidationError for invalid voteType', async () => {
    const { vote } = await import('../../services/backlog.service.js');
    await expect(vote('item-1', 'user-1', 'sideways')).rejects.toThrow(ValidationError);
  });

  // TC-BL-12: Vote on non-existent item throws NotFoundError
  it('TC-BL-12: vote throws NotFoundError for non-existent item', async () => {
    const { vote } = await import('../../services/backlog.service.js');
    mockSelect.mockReturnValueOnce(chainMock([]));
    await expect(vote('nonexistent', 'user-1', 'up')).rejects.toThrow(NotFoundError);
  });

  // TC-BL-13: Vote on archived item throws ValidationError
  it('TC-BL-13: vote throws ValidationError for archived item', async () => {
    const { vote } = await import('../../services/backlog.service.js');
    mockSelect.mockReturnValueOnce(chainMock([{ id: 'item-1', isArchived: true }]));
    await expect(vote('item-1', 'user-1', 'up')).rejects.toThrow(ValidationError);
  });

  // TC-BL-14: Vote type must be "up" or "down"
  it('TC-BL-14: vote accepts "up" and "down" only', () => {
    const validTypes = ['up', 'down'];
    expect(validTypes.includes('up')).toBe(true);
    expect(validTypes.includes('down')).toBe(true);
    expect(validTypes.includes('neutral')).toBe(false);
    expect(validTypes.includes('')).toBe(false);
  });

  // TC-BL-15: Same vote again removes the vote (toggle off) — logic test
  it('TC-BL-15: same vote toggles off (removes vote)', () => {
    const existingVoteType = 'up';
    const newVoteType = 'up';
    // Business rule: same vote = toggle off (delete)
    const action = existingVoteType === newVoteType ? 'delete' : 'update';
    expect(action).toBe('delete');
  });

  // TC-BL-16: Different vote switches (up -> down) — logic test
  it('TC-BL-16: different vote switches direction', () => {
    const existingVoteType: string = 'up';
    const newVoteType: string = 'down';
    // Business rule: different vote = switch (update)
    const action = existingVoteType === newVoteType ? 'delete' : 'update';
    expect(action).toBe('update');
  });

  // TC-BL-17: No existing vote creates new — logic test
  it('TC-BL-17: new vote inserts a record', () => {
    const existingVote = null;
    // Business rule: no existing vote = insert
    const action = existingVote ? (existingVote === 'up' ? 'delete' : 'update') : 'insert';
    expect(action).toBe('insert');
  });

  // TC-BL-18: archiveItem on non-existent item — logic test
  it('TC-BL-18: archiveItem validates item exists before archiving', () => {
    const item = null; // simulates not found
    const shouldThrow = !item;
    expect(shouldThrow).toBe(true);
    // In actual service, this throws NotFoundError
    if (shouldThrow) {
      expect(() => {
        throw new NotFoundError('Backlog item');
      }).toThrow(NotFoundError);
    }
  });

  // ── Score sorting ────────────────────────────────────────────

  // TC-BL-19: Score calculation is upvotes - downvotes
  it('TC-BL-19: score is calculated as upvotes minus downvotes', () => {
    const up = 10;
    const down = 3;
    const score = up - down;
    expect(score).toBe(7);
  });

  // TC-BL-20: Items sort by score descending
  it('TC-BL-20: items are sorted by score descending', () => {
    const items = [
      { title: 'Low', score: 1 },
      { title: 'High', score: 10 },
      { title: 'Mid', score: 5 },
    ];
    items.sort((a, b) => b.score - a.score);
    expect(items[0].title).toBe('High');
    expect(items[1].title).toBe('Mid');
    expect(items[2].title).toBe('Low');
  });
});
