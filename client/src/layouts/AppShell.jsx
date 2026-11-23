import { Outlet } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import DamaskBackground from '../components/common/DamaskBackground';

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="h-full min-w-0 flex-1">
        <DamaskBackground fill>
          <Outlet />
        </DamaskBackground>
      </main>
    </div>
  );
}