import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/features/auth/hooks';
import { useAdminStats } from '@/features/admin/hooks';

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuth();
  const { mutate: logout } = useLogout();
  const { data: adminStats } = useAdminStats();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        setUser(null);
        navigate('/login');
      },
    });
  };

  const isActive = (path: string) => location.pathname === path;

  const menuItems = [
    { label: 'Dashboard', path: '/', icon: '📊' },
    { label: 'Tabungan', path: '/tabungan', icon: '💰' },
    { label: 'Pengaturan', path: '/pengaturan', icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full text-left px-4 py-2 rounded transition ${
                isActive(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </button>
          ))}

          {user?.role === 'ADMIN' && (
            <button
              onClick={() => navigate('/admin/users')}
              className={`w-full text-left px-4 py-2 rounded transition flex items-center gap-2 ${
                isActive('/admin/users')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>👥</span>
              Admin
              {adminStats && adminStats.pending > 0 && (
                <span className="ml-auto bg-red-600 text-white text-xs px-2 py-0.5 rounded">
                  {adminStats.pending}
                </span>
              )}
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-950">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
