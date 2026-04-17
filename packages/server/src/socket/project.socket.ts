import type { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../config/logger.js';
import * as projectChatService from '../services/project-chat.service.js';

// Rate limiter: 1 message per second per socket
const lastMessageTime = new Map<string, number>();

export function registerProjectSocketHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.user.userId as string;
  const userName = socket.data.user.name as string;

  // Track typing timeouts per project
  const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  // ── Join / Leave Project Chat Room ──────────────────────────

  socket.on('project:join', async (data: { projectId: string }) => {
    const { projectId } = data;
    if (!projectId) return;

    try {
      const isMember = await projectChatService.isProjectMember(projectId, userId);
      if (!isMember) {
        socket.emit('error:message', { message: 'Not a member of this project' });
        return;
      }

      const room = `project:${projectId}:chat`;
      socket.join(room);
      logger.debug({ userId, projectId }, 'User joined project chat room');
    } catch (err) {
      logger.error({ err, userId, projectId }, 'Error joining project chat');
      socket.emit('error:message', { message: 'Failed to join project chat' });
    }
  });

  socket.on('project:leave', (data: { projectId: string }) => {
    const { projectId } = data;
    if (!projectId) return;

    const room = `project:${projectId}:chat`;
    socket.leave(room);

    // Clear typing timeout
    const timeout = typingTimeouts.get(projectId);
    if (timeout) {
      clearTimeout(timeout);
      typingTimeouts.delete(projectId);
      socket.to(room).emit('project:typing:update', {
        projectId,
        userId,
        name: userName,
        isTyping: false,
      });
    }
  });

  // ── Send Message ────────────────────────────────────────────

  socket.on(
    'project:message:send',
    async (data: {
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
    }) => {
      const { projectId, content, parentId, attachments } = data;
      if (!projectId || !content?.trim()) return;

      // Rate limit
      const now = Date.now();
      const last = lastMessageTime.get(socket.id) ?? 0;
      if (now - last < 1000) {
        socket.emit('error:rate_limited', { message: 'Sending too fast. Please wait.' });
        return;
      }
      lastMessageTime.set(socket.id, now);

      try {
        const isMember = await projectChatService.isProjectMember(projectId, userId);
        if (!isMember) {
          socket.emit('error:message', { message: 'Not a member of this project' });
          return;
        }

        const message = await projectChatService.sendMessage(
          projectId,
          userId,
          content,
          parentId,
          attachments,
        );

        const room = `project:${projectId}:chat`;
        io.to(room).emit('project:message:new', message);

        // Clear typing for this user
        const timeout = typingTimeouts.get(projectId);
        if (timeout) {
          clearTimeout(timeout);
          typingTimeouts.delete(projectId);
          socket.to(room).emit('project:typing:update', {
            projectId,
            userId,
            name: userName,
            isTyping: false,
          });
        }
      } catch (err) {
        logger.error({ err, userId, projectId }, 'Error sending project message');
        socket.emit('error:message', { message: 'Failed to send message' });
      }
    },
  );

  // ── Edit Message ────────────────────────────────────────────

  socket.on(
    'project:message:edit',
    async (data: { messageId: string; content: string; projectId: string }) => {
      const { messageId, content, projectId } = data;
      if (!messageId || !content?.trim()) return;

      try {
        await projectChatService.editMessage(messageId, userId, content);
        const room = `project:${projectId}:chat`;
        io.to(room).emit('project:message:edit', { messageId, content: content.trim() });
      } catch (err) {
        logger.error({ err, userId, messageId }, 'Error editing project message');
        socket.emit('error:message', {
          message: err instanceof Error ? err.message : 'Failed to edit message',
        });
      }
    },
  );

  // ── Delete Message ──────────────────────────────────────────

  socket.on('project:message:delete', async (data: { messageId: string; projectId: string }) => {
    const { messageId, projectId } = data;
    if (!messageId) return;

    try {
      await projectChatService.deleteMessage(messageId, userId);
      const room = `project:${projectId}:chat`;
      io.to(room).emit('project:message:delete', { messageId });
    } catch (err) {
      logger.error({ err, userId, messageId }, 'Error deleting project message');
      socket.emit('error:message', {
        message: err instanceof Error ? err.message : 'Failed to delete message',
      });
    }
  });

  // ── Typing Indicators ──────────────────────────────────────

  socket.on('project:typing:start', (data: { projectId: string }) => {
    const { projectId } = data;
    if (!projectId) return;

    const room = `project:${projectId}:chat`;
    socket.to(room).emit('project:typing:update', {
      projectId,
      userId,
      name: userName,
      isTyping: true,
    });

    // Auto-stop after 3 seconds
    const existing = typingTimeouts.get(projectId);
    if (existing) clearTimeout(existing);

    typingTimeouts.set(
      projectId,
      setTimeout(() => {
        typingTimeouts.delete(projectId);
        socket.to(room).emit('project:typing:update', {
          projectId,
          userId,
          name: userName,
          isTyping: false,
        });
      }, 3000),
    );
  });

  socket.on('project:typing:stop', (data: { projectId: string }) => {
    const { projectId } = data;
    if (!projectId) return;

    const existing = typingTimeouts.get(projectId);
    if (existing) {
      clearTimeout(existing);
      typingTimeouts.delete(projectId);
    }

    const room = `project:${projectId}:chat`;
    socket.to(room).emit('project:typing:update', {
      projectId,
      userId,
      name: userName,
      isTyping: false,
    });
  });

  // ── Reactions ──────────────────────────────────────────────

  socket.on(
    'project:reaction:add',
    async (data: { messageId: string; emoji: string; projectId: string }) => {
      const { messageId, emoji, projectId } = data;
      if (!messageId || !emoji) return;

      try {
        const reactions = await projectChatService.addReaction(messageId, userId, emoji);
        const room = `project:${projectId}:chat`;
        io.to(room).emit('project:reaction:update', { messageId, reactions });
      } catch (err) {
        logger.error({ err, userId, messageId }, 'Error adding project reaction');
      }
    },
  );

  socket.on(
    'project:reaction:remove',
    async (data: { messageId: string; emoji: string; projectId: string }) => {
      const { messageId, emoji, projectId } = data;
      if (!messageId || !emoji) return;

      try {
        const reactions = await projectChatService.removeReaction(messageId, userId, emoji);
        const room = `project:${projectId}:chat`;
        io.to(room).emit('project:reaction:update', { messageId, reactions });
      } catch (err) {
        logger.error({ err, userId, messageId }, 'Error removing project reaction');
      }
    },
  );

  // ── Read Status ────────────────────────────────────────────

  socket.on('project:read:update', async (data: { projectId: string; messageId: string }) => {
    const { projectId, messageId } = data;
    if (!projectId || !messageId) return;

    try {
      await projectChatService.markRead(projectId, userId, messageId);
      socket.emit('project:unread:update', { projectId });
    } catch (err) {
      logger.error({ err, userId, projectId }, 'Error updating project read status');
    }
  });

  // ── Cleanup on disconnect ──────────────────────────────────

  socket.on('disconnect', () => {
    lastMessageTime.delete(socket.id);
    // Clear all typing timeouts
    for (const [projectId, timeout] of typingTimeouts) {
      clearTimeout(timeout);
      const room = `project:${projectId}:chat`;
      socket.to(room).emit('project:typing:update', {
        projectId,
        userId,
        name: userName,
        isTyping: false,
      });
    }
    typingTimeouts.clear();
  });
}
