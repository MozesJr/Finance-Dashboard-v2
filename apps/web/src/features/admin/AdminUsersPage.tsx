import { useState } from 'react';
import { UserStatus, User } from 'shared';
import { AxiosError } from 'axios';
import {
  useAdminUsers,
  useApproveUser,
  useRejectUser,
  useSuspendUser,
  useReactivateUser,
} from './hooks';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/date';

interface DialogState {
  isOpen: boolean;
  action?: string;
  userId?: string;
  userEmail?: string;
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [status, setStatus] = useState<UserStatus | undefined>(undefined);
  const [dialog, setDialog] = useState<DialogState>({ isOpen: false });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: users, isLoading, error } = useAdminUsers(status);
  const { mutate: approve, isPending: approveLoading } = useApproveUser();
  const { mutate: reject, isPending: rejectLoading } = useRejectUser();
  const { mutate: suspend, isPending: suspendLoading } = useSuspendUser();
  const { mutate: reactivate, isPending: reactivateLoading } = useReactivateUser();

  const handleAction = (action: string, userId: string, userEmail: string) => {
    setDialog({ isOpen: true, action, userId, userEmail });
  };

  const confirmAction = () => {
    if (!dialog.userId || !dialog.action) return;

    const showToast = (message: string, type: 'success' | 'error') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    };

    const config: {
      onSuccess: () => void;
      onError: (error: unknown) => void;
    } = {
      onSuccess: () => {
        showToast(`Aksi berhasil`, 'success');
        setDialog({ isOpen: false });
      },
      onError: (error: unknown) => {
        const axiosError = error as AxiosError<{ message: string }>;
        const message = axiosError.response?.data?.message || 'Aksi gagal';
        showToast(message, 'error');
      },
    };

    switch (dialog.action) {
      case 'approve':
        approve(dialog.userId, config);
        break;
      case 'reject':
        reject(dialog.userId, config);
        break;
      case 'suspend':
        suspend(dialog.userId, config);
        break;
      case 'reactivate':
        reactivate(dialog.userId, config);
        break;
    }
  };

  const getActionButtons = (user: User) => {
    if (user.id === currentUser?.id) return null;

    const buttons = [];
    if (user.status === 'PENDING') {
      buttons.push(
        <button
          key="approve"
          onClick={() => handleAction('approve', user.id, user.email)}
          className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
        >
          Setujui
        </button>,
        <button
          key="reject"
          onClick={() => handleAction('reject', user.id, user.email)}
          className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Tolak
        </button>
      );
    }
    if (user.status === 'ACTIVE') {
      buttons.push(
        <button
          key="suspend"
          onClick={() => handleAction('suspend', user.id, user.email)}
          className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded"
        >
          Suspend
        </button>
      );
    }
    if (user.status === 'SUSPENDED' || user.status === 'REJECTED') {
      buttons.push(
        <button
          key="reactivate"
          onClick={() => handleAction('reactivate', user.id, user.email)}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Aktifkan
        </button>
      );
    }
    return buttons;
  };

  const getStatusBadge = (status: UserStatus) => {
    const styles: Record<UserStatus, string> = {
      PENDING: 'bg-yellow-500/10 text-yellow-400',
      ACTIVE: 'bg-green-500/10 text-green-400',
      REJECTED: 'bg-red-500/10 text-red-400',
      SUSPENDED: 'bg-orange-500/10 text-orange-400',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Manajemen Pengguna</h1>
        <p className="text-gray-400 mt-1">Kelola status dan persetujuan pengguna</p>
      </div>

      {toast && (
        <div
          className={`p-3 rounded text-sm ${
            toast.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Filter Status</label>
        <select
          value={status || ''}
          onChange={(e) => setStatus((e.target.value as UserStatus) || undefined)}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="PENDING">Menunggu</option>
          <option value="ACTIVE">Aktif</option>
          <option value="REJECTED">Ditolak</option>
          <option value="SUSPENDED">Disuspend</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400">
          Gagal memuat data pengguna
        </div>
      ) : !users?.length ? (
        <div className="p-4 bg-gray-900 border border-gray-800 rounded text-gray-400 text-center">
          Tidak ada pengguna
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Terdaftar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((user: User) => (
                <tr key={user.id} className="hover:bg-gray-800/50">
                  <td className="px-6 py-4 text-sm text-gray-200">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-200">{user.role}</td>
                  <td className="px-6 py-4 text-sm">{getStatusBadge(user.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2 flex-wrap">{getActionButtons(user)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-sm">
            <h2 className="text-lg font-bold text-white mb-4">Konfirmasi Aksi</h2>
            <p className="text-gray-400 mb-6">
              Apakah Anda yakin ingin melakukan aksi "{dialog.action}" untuk{' '}
              <span className="font-medium">{dialog.userEmail}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDialog({ isOpen: false })}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-100 rounded transition"
              >
                Batal
              </button>
              <button
                onClick={confirmAction}
                disabled={approveLoading || rejectLoading || suspendLoading || reactivateLoading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded transition"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
