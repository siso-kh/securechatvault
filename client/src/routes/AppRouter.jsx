import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'
import AppShell from '../layouts/AppShell'
import AdminLayout from '../layouts/AdminLayout'
import AuthPage from '../pages/auth/AuthPage'
import AdminLogin from '../pages/admin/AdminLogin'
import HomePage from '../pages/user/HomePage'
import ChatPage from '../pages/user/ChatPage'
import HistoryPage from '../pages/user/HistoryPage'
import ReportPage from '../pages/user/ReportPage'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminPolicies from '../pages/admin/AdminPolicies'
import UsersPage from '../pages/admin/UsersPage'
import AdminAudit from '../pages/admin/AdminAudit'

export default function AppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<ProtectedRoute />}>
        {/* User area */}
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="chat/:id?" element={<ChatPage />} />
          <Route path="report" element={<ReportPage />} />
        </Route>

        {/* Admin area */}
        <Route element={<AdminRoute />}>
          <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route element={<AdminLayout />}>
            <Route path="admin/dashboard" element={<AdminDashboard />} />
            <Route path="admin/policies" element={<AdminPolicies />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/audit" element={<AdminAudit />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}