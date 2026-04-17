import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from '../utils/jwt.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { registerCommunitySocketHandlers } from './community.socket.js';
import { registerProjectSocketHandlers } from './project.socket.js';

// In-memory presence tracking: userId → Set of socketIds
const onlineUsers = new Map<string, Set<string>>();

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function getOnlineUsers(): Map<string, Set<string>> {
  return onlineUsers;
}

export function isUserOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return !!sockets && sockets.size > 0;
}

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT auth middleware on handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.userId as string;
    const userName = socket.data.user.name as string;

    // Track presence
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal room for notifications
    socket.join(`user:${userId}`);

    // Broadcast online status (only if first socket for this user)
    if (onlineUsers.get(userId)!.size === 1) {
      io!.emit('presence:update', { userId, name: userName, status: 'online' });
    }

    // Send full list of currently online users to the newly connected client
    const currentlyOnline: Array<{ userId: string; name: string; status: string }> = [];
    for (const [onlineUserId, socketIds] of onlineUsers.entries()) {
      if (socketIds.size > 0) {
        // Get the name from one of their sockets
        const firstSocketId = socketIds.values().next().value;
        const onlineSocket = io!.sockets.sockets.get(firstSocketId as string);
        const onlineName = onlineSocket?.data?.user?.name || 'Unknown';
        currentlyOnline.push({ userId: onlineUserId, name: onlineName, status: 'online' });
      }
    }
    socket.emit('presence:initial', currentlyOnline);

    logger.info({ userId, socketId: socket.id }, 'Socket connected');

    // Register community event handlers
    registerCommunitySocketHandlers(io!, socket);

    // Register project chat event handlers
    registerProjectSocketHandlers(io!, socket);

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          // Broadcast offline only when all tabs closed
          io!.emit('presence:update', { userId, name: userName, status: 'offline' });
        }
      }
      logger.info({ userId, socketId: socket.id }, 'Socket disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ userId, socketId: socket.id, err }, 'Socket error');
    });
  });

  logger.info('Socket.io server initialized');
  return io;
}
