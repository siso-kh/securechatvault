import { Outlet } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import DamaskBackground from '../components/common/DamaskBackground';

export default function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="h-full flex-1 overflow-y-auto">
        <DamaskBackground>
          <Outlet />
        </DamaskBackground>
      </main>
    </div>
  );
}