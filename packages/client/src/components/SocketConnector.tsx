import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCommunitySocket } from '../hooks/useCommunitySocket';
import { getAccessToken } from '../lib/api';

/**
 * Connects the shared Socket.IO client as soon as the user is authenticated
 * and disconnects on logout. Mounted once at the app root so chat / presence /
 * realtime features work from any page, not just /community.
 */
export function SocketConnector() {
  const { user } = useAuth();
  const connect = useCommunitySocket((s) => s.connect);
  const disconnect = useCommunitySocket((s) => s.disconnect);

  useEffect(() => {
    if (!user) {
      disconnect();
      return;
    }
    const token = getAccessToken();
    if (token) {
      connect(token);
    }
    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  return null;
}
