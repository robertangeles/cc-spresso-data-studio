import type { MessageUser, ReactionGroup } from './community.types.js';

// ── Project Chat Message Types ─────────────────────────────

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  userId: string;
  content: string;
  parentId: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  user: MessageUser;
  attachments: ProjectChatAttachment[];
  reactions: ReactionGroup[];
  replyCount?: number;
}

export interface ProjectChatAttachment {
  id: string;
  messageId: string;
  type: 'image' | 'file' | 'link';
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface ProjectReadStatus {
  projectId: string;
  userId: string;
  lastReadAt: string;
  lastMessageId: string | null;
}

// ── Socket Event Types ─────────────────────────────────────

export interface ProjectChatServerEvents {
  'project:message:new': (data: ProjectChatMessage) => void;
  'project:message:edit': (data: { messageId: string; content: string }) => void;
  'project:message:delete': (data: { messageId: string }) => void;
  'project:typing:update': (data: {
    projectId: string;
    userId: string;
    name: string;
    isTyping: boolean;
  }) => void;
  'project:reaction:update': (data: { messageId: string; reactions: ReactionGroup[] }) => void;
  'project:unread:update': (data: { projectId: string }) => void;
}

export interface ProjectChatClientEvents {
  'project:join': (data: { projectId: string }) => void;
  'project:leave': (data: { projectId: string }) => void;
  'project:message:send': (data: {
    projectId: string;
    content: string;
    parentId?: string;
    attachments?: Array<{
      type: string;
      url: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    }>;
  }) => void;
  'project:message:edit': (data: { messageId: string; content: string; projectId: string }) => void;
  'project:message:delete': (data: { messageId: string; projectId: string }) => void;
  'project:typing:start': (data: { projectId: string }) => void;
  'project:typing:stop': (data: { projectId: string }) => void;
  'project:reaction:add': (data: { messageId: string; emoji: string; projectId: string }) => void;
  'project:reaction:remove': (data: {
    messageId: string;
    emoji: string;
    projectId: string;
  }) => void;
  'project:read:update': (data: { projectId: string; messageId: string }) => void;
}
