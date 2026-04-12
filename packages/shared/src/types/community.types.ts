// ── Community Channel Types ─────────────────────────────────

export interface CommunityChannel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'text' | 'announcement';
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

// ── Community Message Types ─────────────────────────────────

export interface MessageAttachment {
  id: string;
  messageId: string;
  type: 'image' | 'link_preview' | 'file';
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  metadata: LinkPreviewMetadata | null;
  sortOrder: number;
  createdAt: string;
}

export interface LinkPreviewMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface MessageUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface CommunityMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  type: 'text' | 'system';
  parentId: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  user: MessageUser;
  attachments: MessageAttachment[];
  reactions: ReactionGroup[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  hasReacted?: boolean;
}

// ── Direct Message Types ────────────────────────────────────

export interface DirectConversation {
  conversationId: string;
  otherUser: MessageUser;
  lastMessage: { content: string; createdAt: string; userId: string } | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  user: MessageUser;
  attachments: MessageAttachment[];
}

// ── Backlog Types ───────────────────────────────────────────

export interface BacklogItem {
  id: string;
  title: string;
  description: string | null;
  status: 'planned' | 'in_progress' | 'shipped';
  category: string | null;
  estimatedRelease: string | null;
  createdBy: string | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: 'up' | 'down' | null;
  creator?: { name: string } | null;
}

// ── User Block Types ────────────────────────────────────────

export interface UserBlock {
  id: string;
  blockedId: string;
  blockedName: string;
  blockedEmail: string;
  createdAt: string;
}

// ── Socket.io Event Types ───────────────────────────────────

export interface ServerToClientEvents {
  'message:new': (data: CommunityMessage) => void;
  'message:link_preview': (data: { messageId: string; attachments: MessageAttachment[] }) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string }) => void;
  'typing:update': (data: {
    channelId: string;
    userId: string;
    name: string;
    isTyping: boolean;
  }) => void;
  'reaction:update': (data: { messageId: string; reactions: ReactionGroup[] }) => void;
  'presence:update': (data: { userId: string; name: string; status: 'online' | 'offline' }) => void;
  'dm:message:new': (data: DirectMessage) => void;
  'dm:typing:update': (data: {
    conversationId: string;
    userId: string;
    name: string;
    isTyping: boolean;
  }) => void;
  'unread:update': (data: { channelId: string }) => void;
  auth_error: (data: { message: string }) => void;
  'error:rate_limited': (data: { message: string }) => void;
  'error:message': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'channel:join': (data: { channelId: string }) => void;
  'channel:leave': (data: { channelId: string }) => void;
  'message:send': (data: {
    channelId: string;
    content: string;
    attachments?: Array<{
      type: string;
      url: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    }>;
  }) => void;
  'typing:start': (data: { channelId: string }) => void;
  'typing:stop': (data: { channelId: string }) => void;
  'reaction:add': (data: { messageId: string; emoji: string; channelId: string }) => void;
  'reaction:remove': (data: { messageId: string; emoji: string; channelId: string }) => void;
  'dm:join': (data: { conversationId: string }) => void;
  'dm:leave': (data: { conversationId: string }) => void;
  'dm:message:send': (data: {
    conversationId: string;
    content: string;
    attachments?: Array<{ type: string; url: string }>;
  }) => void;
  'dm:typing:start': (data: { conversationId: string }) => void;
  'dm:typing:stop': (data: { conversationId: string }) => void;
  'read:update': (data: { channelId: string; messageId: string }) => void;
}
