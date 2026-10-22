import http from '@/lib/http';
import type { WalletType } from 'shared';

/** Bentuk response API (nominal sebagai string). */
export interface WalletDto {
  id: string;
  name: string;
  type: WalletType;
  color: string | null;
  isArchived: boolean;
  initialBalance: string;
  balance: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletPayload {
  name?: string;
  type?: WalletType;
  initialBalance?: string;
  color?: string | null;
  isArchived?: boolean;
}

export const walletsApi = {
  list: async (includeArchived: boolean): Promise<WalletDto[]> =>
    (await http.get('/wallets', { params: { includeArchived } })).data,
  create: async (payload: WalletPayload): Promise<WalletDto> => (await http.post('/wallets', payload)).data,
  update: async (id: string, payload: WalletPayload): Promise<WalletDto> =>
    (await http.patch(`/wallets/${id}`, payload)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/wallets/${id}`);
  },
};
