
import { Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'

import AppShell from '../layouts/AppShell'
import AuthPage from '../pages/auth/AuthPage'
import AdminLogin from '../pages/admin/AdminLogin'

import HomePage from '../pages/user/HomePage'
import ChatPage from '../pages/user/ChatPage'
import HistoryPage from '../pages/user/HistoryPage'
import AdminDashboard from '../pages/admin/AdminDashboard'

// Temporary stand-ins
const Soon = ({ name }) => (
  <div className="p-10">
    <h1 className="text-3xl">{name}</h1>
  </div>
)

export default function AppRouter() {
  return (
    <Routes>

      {/* User login */}
      <Route path="/login" element={<AuthPage />} />

      {/* Admin login */}
      <Route path="/admin" element={<AdminLogin />} />

      {/* User pages */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="chat/:id?" element={<ChatPage />} />
          <Route path="report" element={<Soon name="Report" />} />

          {/* Admin pages */}
          <Route element={<AdminRoute />}>
            <Route path="admin/dashboard" element={<AdminDashboard />} />
            <Route path="admin/policies" element={<Soon name="Policies" />} />
            <Route path="admin/users" element={<Soon name="Users" />} />
          </Route>

        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  )
}
