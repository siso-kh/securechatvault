import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import AppShell from '../layouts/AppShell';
import AuthPage from '../pages/auth/AuthPage';
import HomePage from '../pages/user/HomePage';

// Temporary stand-ins until each page is built
const Soon = ({ name }) => <div className="p-10"><h1 className="text-3xl">{name}</h1></div>;

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="chat/:id?" element={<Soon name="Chat" />} />
          <Route path="report" element={<Soon name="Report" />} />

          <Route element={<AdminRoute />}>
            <Route path="admin/policies" element={<Soon name="Policies" />} />
            <Route path="admin/users" element={<Soon name="Users" />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}