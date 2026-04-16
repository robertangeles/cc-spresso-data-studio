export type ProjectStatus = 'active' | 'archived' | 'completed';
export type CardPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectMemberRole = 'owner' | 'editor' | 'viewer' | 'member';

export interface ClientContact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface Project {
  id: string;
  userId: string;
  organisationId: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  clientName: string | null;
  clientContacts: ClientContact[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithBoard extends Project {
  columns: KanbanColumn[];
  /** Summary counts per column for the project list view */
  cardCounts?: Record<string, number>;
  totalCards?: number;
  doneCards?: number;
}

export interface KanbanColumn {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  cards: KanbanCard[];
}

export interface KanbanCard {
  id: string;
  columnId: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: CardPriority;
  dueDate: string | null;
  tags: string[];
  sortOrder: number;
  flowId: string | null;
  contentItemId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  coverImageUrl: string | null;
  labels: CardLabel[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  role: ProjectMemberRole;
  addedAt: string;
}

export interface CardLabel {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateProjectDTO {
  name: string;
  description?: string;
  clientName?: string;
  clientContacts?: ClientContact[];
  startDate?: string;
  endDate?: string;
  organisationId?: string;
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  clientName?: string | null;
  clientContacts?: ClientContact[];
  startDate?: string | null;
  endDate?: string | null;
}

export interface CreateColumnDTO {
  name: string;
  color?: string;
}

export interface UpdateColumnDTO {
  name?: string;
  color?: string | null;
}

export interface CreateCardDTO {
  columnId: string;
  title: string;
  description?: string;
  priority?: CardPriority;
  dueDate?: string;
  tags?: string[];
  flowId?: string;
  contentItemId?: string;
}

export interface UpdateCardDTO {
  title?: string;
  description?: string | null;
  priority?: CardPriority;
  dueDate?: string | null;
  tags?: string[];
  flowId?: string | null;
  contentItemId?: string | null;
  assigneeId?: string | null;
  coverImageUrl?: string | null;
}

export interface MoveCardDTO {
  columnId: string;
  sortOrder: number;
}

export interface ReorderDTO {
  ids: string[];
}

export interface CardComment {
  id: string;
  cardId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CardAttachment {
  id: string;
  cardId: string;
  userId: string;
  type: 'image' | 'file' | 'link';
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface CreateCommentDTO {
  content: string;
}

export interface UpdateCommentDTO {
  content: string;
}

export interface CreateAttachmentDTO {
  type: 'image' | 'file' | 'link';
  url: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface CreateProjectMemberDTO {
  userId: string;
  role: ProjectMemberRole;
}

export interface UpdateProjectMemberRoleDTO {
  role: ProjectMemberRole;
}

export interface CreateLabelDTO {
  name: string;
  color: string;
}

export interface UpdateLabelDTO {
  name?: string;
  color?: string;
}
