import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { DashboardLayout } from '@/layouts/DashboardLayout';

// Auth pages
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { WaitingApprovalPage } from '@/features/auth/WaitingApprovalPage';

// Protected pages
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SavingsPage } from '@/features/savings/SavingsPage';
import { AllocationSettingsPage } from '@/features/savings/AllocationSettingsPage';
import { SettingsPage } from '@/pages/SettingsPage';

import { WalletsPage } from '@/features/wallets/WalletsPage';

import { CategoriesPage } from '@/features/categories/CategoriesPage';

import { TransactionsPage } from '@/features/transactions/TransactionsPage';

// Admin pages
import { AdminUsersPage } from '@/features/admin/AdminUsersPage';

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dompet" element={<WalletsPage />} />
          <Route path="/kategori" element={<CategoriesPage />} />
          <Route path="/transaksi" element={<TransactionsPage />} />
          <Route path="/tabungan" element={<SavingsPage />} />
          <Route path="/tabungan/alokasi" element={<AllocationSettingsPage />} />
          <Route path="/pengaturan" element={<SettingsPage />} />

          {/* Admin routes */}
          <Route
            path="/admin/users"
            element={
              <RequireRole role="ADMIN">
                <AdminUsersPage />
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
