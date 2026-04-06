import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3006';

interface CommunitySocketState {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Map<string, string>; // userId → name
  connect: (token: string) => void;
  disconnect: () => void;
}

export const useCommunitySocket = create<CommunitySocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  onlineUsers: new Map(),

  connect: (token: string) => {
    const existing = get().socket;
    if (existing?.connected) return;

    // Disconnect any stale socket
    existing?.disconnect();

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    // Full online users list on initial connect
    socket.on('presence:initial', (data: Array<{ userId: string; name: string }>) => {
      set(() => {
        const users = new Map<string, string>();
        for (const u of data) {
          users.set(u.userId, u.name);
        }
        return { onlineUsers: users };
      });
    });

    // Incremental presence updates
    socket.on('presence:update', (data: { userId: string; name: string; status: string }) => {
      set((state) => {
        const users = new Map(state.onlineUsers);
        if (data.status === 'online') {
          users.set(data.userId, data.name);
        } else {
          users.delete(data.userId);
        }
        return { onlineUsers: users };
      });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    set({ socket, isConnected: false });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, onlineUsers: new Map() });
    }
  },
}));
