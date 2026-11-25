
import { Navigate, Outlet } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function AdminRoute() {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/admin" replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
