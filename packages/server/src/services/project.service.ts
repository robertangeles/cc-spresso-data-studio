import { eq, and, desc, asc, sql, max } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors.js';
import { logActivity } from './project-activity.service.js';
import { uploadImage } from './cloudinary.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the project if the caller is allowed to READ it (view details,
 * list members, see the kanban board).
 *
 * Allowed when the caller is:
 *  - the project creator, or
 *  - a row in `project_members` for this project (any role), or
 *  - an `owner` or `admin` of the project's organisation.
 *
 * Throws NotFoundError if missing, ForbiddenError otherwise.
 */
async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });

  if (!project) throw new NotFoundError('Project');
  if (project.userId === userId) return project;

  // Check explicit project membership
  const pm = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
    columns: { id: true },
  });
  if (pm) return project;

  // Check org admin/owner escalation
  if (project.organisationId) {
    const orgMember = await db.query.organisationMembers.findFirst({
      where: and(
        eq(schema.organisationMembers.organisationId, project.organisationId),
        eq(schema.organisationMembers.userId, userId),
      ),
      columns: { role: true },
    });
    if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
      return project;
    }
  }

  throw new ForbiddenError('You do not have access to this project');
}

/**
 * Returns the project if the caller is allowed to manage it (mutate cards,
 * members, settings, delete).
 *
 * Allowed when the caller is:
 *  - the project creator (`project.userId`), or
 *  - an `owner` or `admin` of the project's organisation.
 *
 * Throws NotFoundError if the project doesn't exist, ForbiddenError otherwise.
 */
async function verifyProjectManageAccess(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });

  if (!project) throw new NotFoundError('Project');
  if (project.userId === userId) return project;

  if (project.organisationId) {
    const orgMember = await db.query.organisationMembers.findFirst({
      where: and(
        eq(schema.organisationMembers.organisationId, project.organisationId),
        eq(schema.organisationMembers.userId, userId),
      ),
      columns: { role: true },
    });
    if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
      return project;
    }
  }

  throw new ForbiddenError('You do not have permission to manage this project');
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
  // A user can see a project when any of these is true:
  //  - they created it (projects.user_id = userId)
  //  - they are an explicit project_members row
  //  - they are owner/admin of the project's organisation
  //
  // Orgs the user belongs to as owner/admin:
  const privilegedOrgs = await db
    .select({ organisationId: schema.organisationMembers.organisationId })
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.userId, userId),
        sql`${schema.organisationMembers.role} IN ('owner', 'admin')`,
      ),
    );
  const privilegedOrgIds = privilegedOrgs.map((o) => o.organisationId);

  // Project ids where user is an explicit project member
  const memberProjects = await db
    .select({ projectId: schema.projectMembers.projectId })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, userId));
  const memberProjectIds = memberProjects.map((m) => m.projectId);

  // Build the WHERE clause dynamically — any of the three conditions
  const conditions = [eq(schema.projects.userId, userId)];
  if (memberProjectIds.length > 0) {
    conditions.push(sql`${schema.projects.id} IN ${memberProjectIds}`);
  }
  if (privilegedOrgIds.length > 0) {
    conditions.push(sql`${schema.projects.organisationId} IN ${privilegedOrgIds}`);
  }
  const whereExpr = conditions.length === 1 ? conditions[0] : sql.join(conditions, sql` OR `);

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
    .where(whereExpr)
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
    organisationId?: string;
  },
) {
  const project = await db.transaction(async (tx) => {
    const [proj] = await tx
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
        organisationId: data.organisationId ?? null,
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
        projectId: proj.id,
        name: col.name,
        color: col.color,
        sortOrder: col.sortOrder,
      })),
    );

    // Creator is always a project member with 'owner' role so they appear
    // in assignment UIs and member lists (not just via projects.userId).
    await tx.insert(schema.projectMembers).values({
      projectId: proj.id,
      userId,
      role: 'owner',
    });

    return proj;
  });

  logActivity(project.id, userId, 'project.created', 'project', project.id, {
    name: project.name,
  }).catch(() => {});

  return project;
}

export async function getProject(projectId: string, userId: string) {
  const project = await verifyProjectAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

  const [updated] = await db
    .update(schema.projects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning();

  return updated;
}

export async function deleteProject(projectId: string, userId: string) {
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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
    assigneeId?: string;
    coverImageUrl?: string;
  },
) {
  await verifyProjectManageAccess(projectId, userId);

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
      assigneeId: data.assigneeId ?? null,
      coverImageUrl: data.coverImageUrl ?? null,
    })
    .returning();

  logActivity(projectId, userId, 'card.created', 'card', card.id, {
    title: card.title,
    columnId: card.columnId,
  }).catch(() => {});

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
    assigneeId?: string | null;
    coverImageUrl?: string | null;
  },
) {
  const ownership = await verifyCardOwnership(cardId, userId);

  const [updated] = await db
    .update(schema.kanbanCards)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.kanbanCards.id, cardId))
    .returning();

  logActivity(ownership.projectId, userId, 'card.updated', 'card', cardId, {
    changes: Object.keys(data),
  }).catch(() => {});

  return updated;
}

export async function deleteCard(cardId: string, userId: string) {
  const ownership = await verifyCardOwnership(cardId, userId);

  await db.delete(schema.kanbanCards).where(eq(schema.kanbanCards.id, cardId));

  logActivity(ownership.projectId, userId, 'card.deleted', 'card', cardId, {}).catch(() => {});
}

export async function moveCard(
  cardId: string,
  userId: string,
  columnId: string,
  sortOrder: number,
) {
  const ownership = await verifyCardOwnership(cardId, userId);

  const [updated] = await db
    .update(schema.kanbanCards)
    .set({ columnId, sortOrder, updatedAt: new Date() })
    .where(eq(schema.kanbanCards.id, cardId))
    .returning();

  logActivity(ownership.projectId, userId, 'card.moved', 'card', cardId, {
    toColumnId: columnId,
    sortOrder,
  }).catch(() => {});

  return updated;
}

export async function reorderCards(
  projectId: string,
  userId: string,
  cardIds: string[],
  columnId: string,
) {
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

  const [comment] = await db
    .insert(schema.kanbanCardComments)
    .values({ cardId, userId, content })
    .returning();

  // Fetch userName via a second query
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { name: true },
  });

  logActivity(projectId, userId, 'comment.added', 'comment', comment.id, {
    cardId,
  }).catch(() => {});

  return { ...comment, userName: user?.name ?? null };
}

export async function updateComment(
  projectId: string,
  userId: string,
  commentId: string,
  content: string,
) {
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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
  await verifyProjectManageAccess(projectId, userId);

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

  logActivity(projectId, userId, 'attachment.added', 'attachment', attachment.id, {
    cardId,
    fileName: attachment.fileName,
    type: attachment.type,
  }).catch(() => {});

  return attachment;
}

export async function deleteAttachment(projectId: string, userId: string, attachmentId: string) {
  await verifyProjectManageAccess(projectId, userId);

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

/**
 * Upload a file to Cloudinary and create an attachment record in one step.
 * Accepts base64 data URI or raw base64 string.
 */
export async function uploadCardAttachment(
  projectId: string,
  userId: string,
  cardId: string,
  file: {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
  },
) {
  await verifyProjectManageAccess(projectId, userId);

  // Verify the card belongs to this project
  const card = await db.query.kanbanCards.findFirst({
    where: and(eq(schema.kanbanCards.id, cardId), eq(schema.kanbanCards.projectId, projectId)),
    columns: { id: true },
  });
  if (!card) throw new NotFoundError('Card');

  const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const publicId = `card_${cardId}_${Date.now()}`;

  const { url } = await uploadImage(base64, {
    folder: `projects/${projectId}/cards`,
    publicId,
    overwrite: false,
  });

  const type = file.mimetype.startsWith('image/') ? 'image' : 'file';

  const [attachment] = await db
    .insert(schema.kanbanCardAttachments)
    .values({
      cardId,
      userId,
      type,
      url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    })
    .returning();

  logActivity(projectId, userId, 'attachment.added', 'attachment', attachment.id, {
    cardId,
    fileName: file.originalname,
    type,
  }).catch(() => {});

  return attachment;
}

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

export async function listProjectMembers(projectId: string, userId: string) {
  const project = await verifyProjectAccess(projectId, userId);

  // Self-heal: legacy projects created before creator was auto-added.
  // Idempotent via the unique (projectId, userId) constraint.
  await db
    .insert(schema.projectMembers)
    .values({ projectId, userId: project.userId, role: 'owner' })
    .onConflictDoNothing();

  const members = await db
    .select({
      id: schema.projectMembers.id,
      projectId: schema.projectMembers.projectId,
      userId: schema.projectMembers.userId,
      userName: schema.users.name,
      userEmail: schema.users.email,
      userAvatar: schema.userProfiles.avatarUrl,
      role: schema.projectMembers.role,
      addedAt: schema.projectMembers.addedAt,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.projectMembers.userId, schema.userProfiles.userId))
    .where(eq(schema.projectMembers.projectId, projectId))
    .orderBy(asc(schema.projectMembers.addedAt));

  return members;
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  data: { userId: string; role: string },
) {
  const project = await verifyProjectManageAccess(projectId, userId);

  // Validate target user exists
  const targetUser = await db.query.users.findFirst({
    where: eq(schema.users.id, data.userId),
    columns: { id: true },
  });
  if (!targetUser) throw new NotFoundError('User');

  // Enforce: target user must be a member of the project's organisation.
  // Guards against direct API calls bypassing the UI's org-scoped picker.
  if (!project.organisationId) {
    throw new ValidationError({
      projectId: ['Project has no organisation — cannot assign members'],
    });
  }
  const orgMembership = await db.query.organisationMembers.findFirst({
    where: and(
      eq(schema.organisationMembers.organisationId, project.organisationId),
      eq(schema.organisationMembers.userId, data.userId),
    ),
    columns: { userId: true },
  });
  if (!orgMembership) {
    throw new ValidationError({
      userId: ["User is not a member of this project's organisation"],
    });
  }

  // Reject cleanly if already a project member (unique constraint would 500)
  const existing = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, data.userId),
    ),
    columns: { id: true },
  });
  if (existing) {
    throw new ConflictError('User is already a member of this project');
  }

  const [inserted] = await db
    .insert(schema.projectMembers)
    .values({
      projectId,
      userId: data.userId,
      role: data.role ?? 'member',
    })
    .returning();

  // Return the same enriched shape as listProjectMembers so the client can
  // render it directly (userName, userEmail, userAvatar).
  const [member] = await db
    .select({
      id: schema.projectMembers.id,
      projectId: schema.projectMembers.projectId,
      userId: schema.projectMembers.userId,
      userName: schema.users.name,
      userEmail: schema.users.email,
      userAvatar: schema.userProfiles.avatarUrl,
      role: schema.projectMembers.role,
      addedAt: schema.projectMembers.addedAt,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.projectMembers.userId, schema.userProfiles.userId))
    .where(eq(schema.projectMembers.id, inserted.id));

  return member;
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  targetUserId: string,
  role: string,
) {
  await verifyProjectManageAccess(projectId, userId);

  const existing = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, targetUserId),
    ),
  });
  if (!existing) throw new NotFoundError('Project member');

  const [updated] = await db
    .update(schema.projectMembers)
    .set({ role })
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, targetUserId),
      ),
    )
    .returning();

  return updated;
}

export async function removeProjectMember(projectId: string, userId: string, targetUserId: string) {
  await verifyProjectManageAccess(projectId, userId);

  const existing = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, targetUserId),
    ),
  });
  if (!existing) throw new NotFoundError('Project member');

  await db
    .delete(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, targetUserId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Card Labels
// ---------------------------------------------------------------------------

export async function listLabels(projectId: string, userId: string) {
  await verifyProjectManageAccess(projectId, userId);

  return db.query.cardLabels.findMany({
    where: eq(schema.cardLabels.projectId, projectId),
    orderBy: [asc(schema.cardLabels.name)],
  });
}

export async function createLabel(
  projectId: string,
  userId: string,
  data: { name: string; color: string },
) {
  await verifyProjectManageAccess(projectId, userId);

  if (!data.name?.trim()) throw new Error('Label name is required');
  if (!data.color?.trim()) throw new Error('Label color is required');

  const [label] = await db
    .insert(schema.cardLabels)
    .values({ projectId, name: data.name.trim(), color: data.color.trim() })
    .returning();

  return label;
}

export async function updateLabel(
  projectId: string,
  userId: string,
  labelId: string,
  data: { name?: string; color?: string },
) {
  await verifyProjectManageAccess(projectId, userId);

  const existing = await db.query.cardLabels.findFirst({
    where: and(eq(schema.cardLabels.id, labelId), eq(schema.cardLabels.projectId, projectId)),
  });
  if (!existing) throw new NotFoundError('Label');

  const [updated] = await db
    .update(schema.cardLabels)
    .set({
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.color !== undefined ? { color: data.color.trim() } : {}),
    })
    .where(eq(schema.cardLabels.id, labelId))
    .returning();

  return updated;
}

export async function deleteLabel(projectId: string, userId: string, labelId: string) {
  await verifyProjectManageAccess(projectId, userId);

  const existing = await db.query.cardLabels.findFirst({
    where: and(eq(schema.cardLabels.id, labelId), eq(schema.cardLabels.projectId, projectId)),
  });
  if (!existing) throw new NotFoundError('Label');

  await db.delete(schema.cardLabels).where(eq(schema.cardLabels.id, labelId));
}

export async function assignLabel(
  projectId: string,
  userId: string,
  cardId: string,
  labelId: string,
) {
  await verifyProjectManageAccess(projectId, userId);

  // Verify card and label both belong to this project
  const [card, label] = await Promise.all([
    db.query.kanbanCards.findFirst({
      where: and(eq(schema.kanbanCards.id, cardId), eq(schema.kanbanCards.projectId, projectId)),
      columns: { id: true },
    }),
    db.query.cardLabels.findFirst({
      where: and(eq(schema.cardLabels.id, labelId), eq(schema.cardLabels.projectId, projectId)),
      columns: { id: true },
    }),
  ]);

  if (!card) throw new NotFoundError('Card');
  if (!label) throw new NotFoundError('Label');

  // Upsert — ignore conflict on duplicate
  await db.insert(schema.cardLabelAssignments).values({ cardId, labelId }).onConflictDoNothing();

  return { cardId, labelId };
}

export async function removeCardLabel(
  projectId: string,
  userId: string,
  cardId: string,
  labelId: string,
) {
  await verifyProjectManageAccess(projectId, userId);

  await db
    .delete(schema.cardLabelAssignments)
    .where(
      and(
        eq(schema.cardLabelAssignments.cardId, cardId),
        eq(schema.cardLabelAssignments.labelId, labelId),
      ),
    );
}
