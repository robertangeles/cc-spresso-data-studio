import type { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../config/logger.js';
import * as communityService from '../services/community.service.js';

// Typing indicator auto-stop timers
const typingTimers = new Map<string, NodeJS.Timeout>();

export function registerCommunitySocketHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.user.userId as string;
  const userName = socket.data.user.name as string;
  const userRole = socket.data.user.role as string;

  // Rate limiting: track last message time per socket
  let lastMessageTime = 0;

  // ── Channel room management ──────────────────────────────

  socket.on('channel:join', (data: { channelId: string }) => {
    socket.join(`channel:${data.channelId}`);
  });

  socket.on('channel:leave', (data: { channelId: string }) => {
    socket.leave(`channel:${data.channelId}`);
  });

  // ── Channel messages ─────────────────────────────────────

  socket.on(
    'message:send',
    async (data: {
      channelId: string;
      content: string;
      attachments?: Array<{
        type: string;
        url: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      }>;
    }) => {
      // Rate limit: 1 message per second
      const now = Date.now();
      if (now - lastMessageTime < 1000) {
        socket.emit('error:rate_limited', { message: 'Slow down — max 1 message per second' });
        return;
      }
      lastMessageTime = now;

      try {
        const message = await communityService.sendMessage(
          data.channelId,
          userId,
          data.content,
          userRole,
          data.attachments,
        );

        // Broadcast to channel room
        io.to(`channel:${data.channelId}`).emit('message:new', message);

        // Update unread for members not in the room
        const memberIds = await communityService.getChannelMemberIds(data.channelId);
        for (const memberId of memberIds) {
          if (memberId === userId) continue;
          // Check if user is in the channel room
          const memberSockets = await io.in(`channel:${data.channelId}`).fetchSockets();
          const isInRoom = memberSockets.some((s) => s.data.user.userId === memberId);
          if (!isInRoom) {
            io.to(`user:${memberId}`).emit('unread:update', {
              channelId: data.channelId,
            });
          }
        }
      } catch (err) {
        logger.error({ userId, channelId: data.channelId, err }, 'Socket message:send failed');
        socket.emit('error:message', {
          message: err instanceof Error ? err.message : 'Failed to send message',
        });
      }
    },
  );

  // ── Typing indicators ────────────────────────────────────

  socket.on('typing:start', (data: { channelId: string }) => {
    const timerKey = `${userId}:${data.channelId}`;

    socket.to(`channel:${data.channelId}`).emit('typing:update', {
      channelId: data.channelId,
      userId,
      name: userName,
      isTyping: true,
    });

    // Auto-stop after 3 seconds
    if (typingTimers.has(timerKey)) {
      clearTimeout(typingTimers.get(timerKey));
    }
    typingTimers.set(
      timerKey,
      setTimeout(() => {
        socket.to(`channel:${data.channelId}`).emit('typing:update', {
          channelId: data.channelId,
          userId,
          name: userName,
          isTyping: false,
        });
        typingTimers.delete(timerKey);
      }, 3000),
    );
  });

  socket.on('typing:stop', (data: { channelId: string }) => {
    const timerKey = `${userId}:${data.channelId}`;
    if (typingTimers.has(timerKey)) {
      clearTimeout(typingTimers.get(timerKey));
      typingTimers.delete(timerKey);
    }
    socket.to(`channel:${data.channelId}`).emit('typing:update', {
      channelId: data.channelId,
      userId,
      name: userName,
      isTyping: false,
    });
  });

  // ── Reactions ────────────────────────────────────────────

  socket.on(
    'reaction:add',
    async (data: { messageId: string; emoji: string; channelId: string }) => {
      try {
        const reactions = await communityService.addReaction(data.messageId, userId, data.emoji);
        io.to(`channel:${data.channelId}`).emit('reaction:update', {
          messageId: data.messageId,
          reactions,
        });
      } catch (err) {
        logger.error({ userId, err }, 'Socket reaction:add failed');
      }
    },
  );

  socket.on(
    'reaction:remove',
    async (data: { messageId: string; emoji: string; channelId: string }) => {
      try {
        const reactions = await communityService.removeReaction(data.messageId, userId, data.emoji);
        io.to(`channel:${data.channelId}`).emit('reaction:update', {
          messageId: data.messageId,
          reactions,
        });
      } catch (err) {
        logger.error({ userId, err }, 'Socket reaction:remove failed');
      }
    },
  );

  // ── Read tracking ────────────────────────────────────────

  socket.on('read:update', async (data: { channelId: string; messageId: string }) => {
    try {
      await communityService.updateLastRead(data.channelId, userId, data.messageId);
    } catch (err) {
      logger.error({ userId, err }, 'Socket read:update failed');
    }
  });

  // ── DM room management ──────────────────────────────────

  socket.on('dm:join', (data: { conversationId: string }) => {
    socket.join(`dm:${data.conversationId}`);
  });

  socket.on('dm:leave', (data: { conversationId: string }) => {
    socket.leave(`dm:${data.conversationId}`);
  });

  // ── DM messages ─────────────────────────────────────────

  socket.on(
    'dm:message:send',
    async (data: {
      conversationId: string;
      content: string;
      attachments?: Array<{ type: string; url: string }>;
    }) => {
      // Rate limit
      const now = Date.now();
      if (now - lastMessageTime < 1000) {
        socket.emit('error:rate_limited', { message: 'Slow down — max 1 message per second' });
        return;
      }
      lastMessageTime = now;

      try {
        // Import dm service lazily to avoid circular deps
        const dmService = await import('../services/dm.service.js');
        const message = await dmService.sendMessage(
          data.conversationId,
          userId,
          data.content,
          data.attachments,
        );

        // Broadcast to everyone in the DM room (including sender)
        io.to(`dm:${data.conversationId}`).emit('dm:message:new', message);
      } catch (err) {
        logger.error(
          { userId, conversationId: data.conversationId, err },
          'Socket dm:message:send failed',
        );
        socket.emit('error:message', {
          message: err instanceof Error ? err.message : 'Failed to send message',
        });
      }
    },
  );

  // ── DM typing ───────────────────────────────────────────

  socket.on('dm:typing:start', (data: { conversationId: string }) => {
    socket.to(`dm:${data.conversationId}`).emit('dm:typing:update', {
      conversationId: data.conversationId,
      userId,
      name: userName,
      isTyping: true,
    });
  });

  socket.on('dm:typing:stop', (data: { conversationId: string }) => {
    socket.to(`dm:${data.conversationId}`).emit('dm:typing:update', {
      conversationId: data.conversationId,
      userId,
      name: userName,
      isTyping: false,
    });
  });

  // Clean up typing timers on disconnect
  socket.on('disconnect', () => {
    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
  });
}
