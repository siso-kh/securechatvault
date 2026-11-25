import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user) return <Outlet />;
  return <Navigate to={pathname.startsWith('/admin') ? '/admin/login' : '/auth'} replace />;
}