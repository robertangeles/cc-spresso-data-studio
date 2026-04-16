import { eq, and, desc, asc, sql, max } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyProjectOwnership(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });

  if (!project) throw new NotFoundError('Project');
  if (project.userId !== userId) throw new ForbiddenError('You do not have access to this project');

  return project;
}

async function verifyColumnOwnership(columnId: string, userId: string) {
  const col = await db
    .select({
      id: schema.kanbanColumns.id,
      projectId: schema.kanbanColumns.projectId,
      userId: schema.projects.userId,
    })
    .from(schema.kanbanColumns)
    .innerJoin(schema.projects, eq(schema.kanbanColumns.projectId, schema.projects.id))
    .where(eq(schema.kanbanColumns.id, columnId))
    .limit(1);

  if (col.length === 0) throw new NotFoundError('Column');
  if (col[0].userId !== userId) throw new ForbiddenError('You do not have access to this column');

  return col[0];
}

async function verifyCardOwnership(cardId: string, userId: string) {
  const card = await db
    .select({
      id: schema.kanbanCards.id,
      columnId: schema.kanbanCards.columnId,
      projectId: schema.kanbanCards.projectId,
      userId: schema.projects.userId,
    })
    .from(schema.kanbanCards)
    .innerJoin(schema.projects, eq(schema.kanbanCards.projectId, schema.projects.id))
    .where(eq(schema.kanbanCards.id, cardId))
    .limit(1);

  if (card.length === 0) throw new NotFoundError('Card');
  if (card[0].userId !== userId) throw new ForbiddenError('You do not have access to this card');

  return card[0];
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(userId: string) {
  const projectRows = await db
    .select({
      id: schema.projects.id,
      userId: schema.projects.userId,
      name: schema.projects.name,
      description: schema.projects.description,
      status: schema.projects.status,
      clientName: schema.projects.clientName,
      clientContacts: schema.projects.clientContacts,
      startDate: schema.projects.startDate,
      endDate: schema.projects.endDate,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
      totalCards: sql<number>`coalesce(count(${schema.kanbanCards.id}), 0)`.as('total_cards'),
      doneCards:
        sql<number>`coalesce(count(${schema.kanbanCards.id}) filter (where ${schema.kanbanColumns.name} = 'Done'), 0)`.as(
          'done_cards',
        ),
    })
    .from(schema.projects)
    .leftJoin(schema.kanbanCards, eq(schema.kanbanCards.projectId, schema.projects.id))
    .leftJoin(schema.kanbanColumns, eq(schema.kanbanCards.columnId, schema.kanbanColumns.id))
    .where(eq(schema.projects.userId, userId))
    .groupBy(schema.projects.id)
    .orderBy(desc(schema.projects.updatedAt));

  return projectRows;
}

export async function createProject(
  userId: string,
  data: {
    name: string;
    description?: string;
    status?: string;
    clientName?: string;
    clientContacts?: unknown;
    startDate?: string;
    endDate?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({
        userId,
        name: data.name,
        description: data.description ?? null,
        status: data.status ?? 'active',
        clientName: data.clientName ?? null,
        clientContacts: data.clientContacts ?? [],
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      })
      .returning();

    const defaultColumns = [
      { name: 'Backlog', color: 'slate', sortOrder: 0 },
      { name: 'In Progress', color: 'amber', sortOrder: 1 },
      { name: 'Review', color: 'blue', sortOrder: 2 },
      { name: 'Done', color: 'emerald', sortOrder: 3 },
    ];

    await tx.insert(schema.kanbanColumns).values(
      defaultColumns.map((col) => ({
        projectId: project.id,
        name: col.name,
        color: col.color,
        sortOrder: col.sortOrder,
      })),
    );

    return project;
  });
}

export async function getProject(projectId: string, userId: string) {
  const project = await verifyProjectOwnership(projectId, userId);

  const columns = await db.query.kanbanColumns.findMany({
    where: eq(schema.kanbanColumns.projectId, projectId),
    orderBy: [asc(schema.kanbanColumns.sortOrder)],
  });

  const cards = await db.query.kanbanCards.findMany({
    where: eq(schema.kanbanCards.projectId, projectId),
    orderBy: [asc(schema.kanbanCards.sortOrder)],
  });

  // Group cards by column
  const cardsByColumn: Record<string, typeof cards> = {};
  for (const col of columns) {
    cardsByColumn[col.id] = [];
  }
  for (const card of cards) {
    if (cardsByColumn[card.columnId]) {
      cardsByColumn[card.columnId].push(card);
    }
  }

  return {
    ...project,
    columns: columns.map((col) => ({
      ...col,
      cards: cardsByColumn[col.id] ?? [],
    })),
  };
}

export async function updateProject(
  projectId: string,
  userId: string,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
    clientName?: string | null;
    clientContacts?: unknown;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  await verifyProjectOwnership(projectId, userId);

  const [updated] = await db
    .update(schema.projects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning();

  return updated;
}

export async function deleteProject(projectId: string, userId: string) {
  await verifyProjectOwnership(projectId, userId);

  await db
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export async function addColumn(
  projectId: string,
  userId: string,
  data: { name: string; color?: string },
) {
  await verifyProjectOwnership(projectId, userId);

  const [maxResult] = await db
    .select({ maxOrder: max(schema.kanbanColumns.sortOrder) })
    .from(schema.kanbanColumns)
    .where(eq(schema.kanbanColumns.projectId, projectId));

  const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

  const [column] = await db
    .insert(schema.kanbanColumns)
    .values({
      projectId,
      name: data.name,
      color: data.color ?? null,
      sortOrder: nextOrder,
    })
    .returning();

  return column;
}

export async function updateColumn(
  columnId: string,
  userId: string,
  data: { name?: string; color?: string | null },
) {
  await verifyColumnOwnership(columnId, userId);

  const [updated] = await db
    .update(schema.kanbanColumns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.kanbanColumns.id, columnId))
    .returning();

  return updated;
}

export async function deleteColumn(columnId: string, userId: string) {
  await verifyColumnOwnership(columnId, userId);

  await db.delete(schema.kanbanColumns).where(eq(schema.kanbanColumns.id, columnId));
}

export async function reorderColumns(projectId: string, userId: string, columnIds: string[]) {
  await verifyProjectOwnership(projectId, userId);

  await db.transaction(async (tx) => {
    for (let i = 0; i < columnIds.length; i++) {
      await tx
        .update(schema.kanbanColumns)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(schema.kanbanColumns.id, columnIds[i]),
            eq(schema.kanbanColumns.projectId, projectId),
          ),
        );
    }
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function createCard(
  projectId: string,
  userId: string,
  data: {
    columnId: string;
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    tags?: unknown;
    flowId?: string;
    contentItemId?: string;
  },
) {
  await verifyProjectOwnership(projectId, userId);

  const [maxResult] = await db
    .select({ maxOrder: max(schema.kanbanCards.sortOrder) })
    .from(schema.kanbanCards)
    .where(eq(schema.kanbanCards.columnId, data.columnId));

  const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

  const [card] = await db
    .insert(schema.kanbanCards)
    .values({
      projectId,
      columnId: data.columnId,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority ?? 'medium',
      dueDate: data.dueDate ?? null,
      tags: data.tags ?? [],
      sortOrder: nextOrder,
      flowId: data.flowId ?? null,
      contentItemId: data.contentItemId ?? null,
    })
    .returning();

  return card;
}

export async function updateCard(
  cardId: string,
  userId: string,
  data: {
    title?: string;
    description?: string | null;
    priority?: string;
    dueDate?: string | null;
    tags?: unknown;
    flowId?: string | null;
    contentItemId?: string | null;
  },
) {
  await verifyCardOwnership(cardId, userId);

  const [updated] = await db
    .update(schema.kanbanCards)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.kanbanCards.id, cardId))
    .returning();

  return updated;
}

export async function deleteCard(cardId: string, userId: string) {
  await verifyCardOwnership(cardId, userId);

  await db.delete(schema.kanbanCards).where(eq(schema.kanbanCards.id, cardId));
}

export async function moveCard(
  cardId: string,
  userId: string,
  columnId: string,
  sortOrder: number,
) {
  await verifyCardOwnership(cardId, userId);

  const [updated] = await db
    .update(schema.kanbanCards)
    .set({ columnId, sortOrder, updatedAt: new Date() })
    .where(eq(schema.kanbanCards.id, cardId))
    .returning();

  return updated;
}

export async function reorderCards(
  projectId: string,
  userId: string,
  cardIds: string[],
  columnId: string,
) {
  await verifyProjectOwnership(projectId, userId);

  await db.transaction(async (tx) => {
    for (let i = 0; i < cardIds.length; i++) {
      await tx
        .update(schema.kanbanCards)
        .set({ sortOrder: i, columnId, updatedAt: new Date() })
        .where(
          and(eq(schema.kanbanCards.id, cardIds[i]), eq(schema.kanbanCards.projectId, projectId)),
        );
    }
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function listComments(projectId: string, userId: string, cardId: string) {
  await verifyProjectOwnership(projectId, userId);

  const comments = await db
    .select({
      id: schema.kanbanCardComments.id,
      cardId: schema.kanbanCardComments.cardId,
      userId: schema.kanbanCardComments.userId,
      content: schema.kanbanCardComments.content,
      isEdited: schema.kanbanCardComments.isEdited,
      createdAt: schema.kanbanCardComments.createdAt,
      updatedAt: schema.kanbanCardComments.updatedAt,
      userName: schema.users.name,
    })
    .from(schema.kanbanCardComments)
    .innerJoin(schema.users, eq(schema.kanbanCardComments.userId, schema.users.id))
    .where(eq(schema.kanbanCardComments.cardId, cardId))
    .orderBy(asc(schema.kanbanCardComments.createdAt));

  return comments;
}

export async function addComment(
  projectId: string,
  userId: string,
  cardId: string,
  content: string,
) {
  await verifyProjectOwnership(projectId, userId);

  const [comment] = await db
    .insert(schema.kanbanCardComments)
    .values({ cardId, userId, content })
    .returning();

  // Fetch userName via a second query
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { name: true },
  });

  return { ...comment, userName: user?.name ?? null };
}

export async function updateComment(
  projectId: string,
  userId: string,
  commentId: string,
  content: string,
) {
  await verifyProjectOwnership(projectId, userId);

  // Verify the comment exists and belongs to this user
  const existing = await db.query.kanbanCardComments.findFirst({
    where: eq(schema.kanbanCardComments.id, commentId),
  });

  if (!existing) throw new NotFoundError('Comment');
  if (existing.userId !== userId) throw new ForbiddenError('You can only edit your own comments');

  const [updated] = await db
    .update(schema.kanbanCardComments)
    .set({ content, isEdited: true, updatedAt: new Date() })
    .where(eq(schema.kanbanCardComments.id, commentId))
    .returning();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { name: true },
  });

  return { ...updated, userName: user?.name ?? null };
}

export async function deleteComment(projectId: string, userId: string, commentId: string) {
  await verifyProjectOwnership(projectId, userId);

  const existing = await db.query.kanbanCardComments.findFirst({
    where: eq(schema.kanbanCardComments.id, commentId),
  });

  if (!existing) throw new NotFoundError('Comment');
  if (existing.userId !== userId) throw new ForbiddenError('You can only delete your own comments');

  await db.delete(schema.kanbanCardComments).where(eq(schema.kanbanCardComments.id, commentId));
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function listAttachments(projectId: string, userId: string, cardId: string) {
  await verifyProjectOwnership(projectId, userId);

  const attachments = await db.query.kanbanCardAttachments.findMany({
    where: eq(schema.kanbanCardAttachments.cardId, cardId),
    orderBy: [asc(schema.kanbanCardAttachments.createdAt)],
  });

  return attachments;
}

export async function addAttachment(
  projectId: string,
  userId: string,
  cardId: string,
  data: { type: string; url: string; fileName?: string; fileSize?: number; mimeType?: string },
) {
  await verifyProjectOwnership(projectId, userId);

  const [attachment] = await db
    .insert(schema.kanbanCardAttachments)
    .values({
      cardId,
      userId,
      type: data.type,
      url: data.url,
      fileName: data.fileName ?? null,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
    })
    .returning();

  return attachment;
}

export async function deleteAttachment(projectId: string, userId: string, attachmentId: string) {
  await verifyProjectOwnership(projectId, userId);

  const existing = await db.query.kanbanCardAttachments.findFirst({
    where: eq(schema.kanbanCardAttachments.id, attachmentId),
  });

  if (!existing) throw new NotFoundError('Attachment');
  if (existing.userId !== userId)
    throw new ForbiddenError('You can only delete your own attachments');

  await db
    .delete(schema.kanbanCardAttachments)
    .where(eq(schema.kanbanCardAttachments.id, attachmentId));
}
