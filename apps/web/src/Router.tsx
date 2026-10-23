import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { DashboardLayout } from '@/layouts/DashboardLayout';

// Auth pages
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { WaitingApprovalPage } from '@/features/auth/WaitingApprovalPage';

// Halaman terlindungi dimuat malas agar bundel awal kecil (recharts hanya ikut Dashboard).
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SavingsPage = lazy(() => import('@/features/savings/SavingsPage').then((m) => ({ default: m.SavingsPage })));
const AllocationSettingsPage = lazy(() =>
  import('@/features/savings/AllocationSettingsPage').then((m) => ({ default: m.AllocationSettingsPage })),
);
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const WalletsPage = lazy(() => import('@/features/wallets/WalletsPage').then((m) => ({ default: m.WalletsPage })));
const CategoriesPage = lazy(() =>
  import('@/features/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
);
const TransactionsPage = lazy(() =>
  import('@/features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
);
const AdminUsersPage = lazy(() => import('@/features/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));

function PageFallback() {
  return <div className="p-6 text-sm text-muted-foreground">Memuat…</div>;
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/menunggu-persetujuan" element={<WaitingApprovalPage />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
          <Route path="/dompet" element={<Suspense fallback={<PageFallback />}><WalletsPage /></Suspense>} />
          <Route path="/kategori" element={<Suspense fallback={<PageFallback />}><CategoriesPage /></Suspense>} />
          <Route path="/transaksi" element={<Suspense fallback={<PageFallback />}><TransactionsPage /></Suspense>} />
          <Route path="/tabungan" element={<Suspense fallback={<PageFallback />}><SavingsPage /></Suspense>} />
          <Route path="/tabungan/alokasi" element={<Suspense fallback={<PageFallback />}><AllocationSettingsPage /></Suspense>} />
          <Route path="/pengaturan" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />

          {/* Admin routes */}
          <Route
            path="/admin/users"
            element={
              <RequireRole role="ADMIN">
                <Suspense fallback={<PageFallback />}>
                  <AdminUsersPage />
                </Suspense>
              </RequireRole>
            }
          />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
