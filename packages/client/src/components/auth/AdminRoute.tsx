import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Route guard that restricts access to Administrator users only.
 * Non-admin users are redirected to the dashboard.
 */
export function AdminRoute() {
  const { user } = useAuth();

  if (user?.role !== 'Administrator') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
