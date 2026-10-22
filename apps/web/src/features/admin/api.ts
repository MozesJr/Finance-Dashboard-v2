import http from '@/lib/http';
import { User, UserStatus } from 'shared';

export interface AdminStats {
  pending: number;
  active: number;
  rejected: number;
  suspended: number;
}

export const adminApi = {
  listUsers: async (status?: UserStatus): Promise<User[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const response = await http.get('/admin/users', { params });
    return response.data;
  },

  getStats: async (): Promise<AdminStats> => {
    const response = await http.get('/admin/stats');
    return response.data;
  },

  approveUser: async (id: string): Promise<void> => {
    await http.patch(`/admin/users/${id}/approve`);
  },

  rejectUser: async (id: string): Promise<void> => {
    await http.patch(`/admin/users/${id}/reject`);
  },

  suspendUser: async (id: string): Promise<void> => {
    await http.patch(`/admin/users/${id}/suspend`);
  },

  reactivateUser: async (id: string): Promise<void> => {
    await http.patch(`/admin/users/${id}/reactivate`);
  },
};
