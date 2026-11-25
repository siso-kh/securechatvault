import { Navigate, Outlet } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function AdminRoute() {
  const { user } = useAuth()

  // Not signed in, or signed in as someone who is not an admin: the admin
  // login page explains the situation and offers a sign-out.
  if (user?.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }

  return <Outlet />
}
