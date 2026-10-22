import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Wallet, Menu, PiggyBank, Settings, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/features/auth/hooks';
import { useAdminStats } from '@/features/admin/hooks';
import { cn } from '@/lib/utils';

interface MenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Dompet', path: '/dompet', icon: Wallet },
  { label: 'Tabungan', path: '/tabungan', icon: PiggyBank },
  { label: 'Pengaturan', path: '/pengaturan', icon: Settings },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuth();
  const { mutate: logout } = useLogout();
  const { data: adminStats } = useAdminStats();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  // Drawer tertutup otomatis saat pindah halaman.
  const drawerOpen = drawerPath === location.pathname;

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        setUser(null);
        navigate('/login');
      },
    });
  };

  const items = user?.role === 'ADMIN' ? [...MENU_ITEMS, { label: 'Admin', path: '/admin/users', icon: Users }] : MENU_ITEMS;

  const sidebar = (
    <>
      <div className="flex items-center justify-between border-b border-line p-5">
        <h1 className="text-xl font-bold text-fg">Finance</h1>
        <button
          className="rounded p-1 text-muted hover:text-fg md:hidden"
          onClick={() => setDrawerPath(null)}
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {path === '/admin/users' && adminStats && adminStats.pending > 0 && (
              <span className="ml-auto rounded bg-expense px-2 py-0.5 text-xs text-white">{adminStats.pending}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <p className="truncate px-3 pb-2 text-xs text-muted">{user?.email}</p>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-expense"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-app">
      <aside className="hidden w-60 flex-col border-r border-line bg-surface md:flex">{sidebar}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawerPath(null)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerPath(location.pathname)}
            className="rounded p-1 text-muted hover:text-fg"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-fg">Finance</span>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
