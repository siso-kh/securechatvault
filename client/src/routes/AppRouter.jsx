import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'
import AppShell from '../layouts/AppShell'
import AuthPage from '../pages/auth/AuthPage'
import AdminLogin from '../pages/admin/AdminLogin'
import HomePage from '../pages/user/HomePage'
import ChatPage from '../pages/user/ChatPage'
import HistoryPage from '../pages/user/HistoryPage'
import ReportPage from '../pages/user/ReportPage'
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
      {/* Public / Auth */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Protected User Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="chat/:id?" element={<ChatPage />} />
          
          {/* We use your actual ReportPage here instead of the Soon placeholder */}
          <Route path="report" element={<ReportPage />} />

          {/* Admin pages */}
          <Route element={<AdminRoute />}>
            <Route path="admin/dashboard" element={<AdminDashboard />} />
            <Route path="admin/policies" element={<Soon name="Policies" />} />
            <Route path="admin/users" element={<Soon name="Users" />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}