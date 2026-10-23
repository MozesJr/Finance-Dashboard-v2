import http from '@/lib/http';
import type { WalletType } from 'shared';

export interface InvestmentDto {
  capital: string;
  unrealized: string;
  unrealizedPct: number | null;
  lastAdjustedAt: string | null;
}

export interface ValuationEntryDto {
  id: string;
  /** selisih bertanda */
  amount: string;
  date: string;
  note: string | null;
}

/** Bentuk response API (nominal sebagai string). */
export interface WalletDto {
  id: string;
  name: string;
  type: WalletType;
  color: string | null;
  isArchived: boolean;
  isDefault: boolean;
  initialBalance: string;
  balance: string;
  /** Hanya dompet INVESTMENT. */
  investment?: InvestmentDto;
  createdAt: string;
  updatedAt: string;
}

export interface WalletPayload {
  name?: string;
  type?: WalletType;
  initialBalance?: string;
  color?: string | null;
  isArchived?: boolean;
  isDefault?: boolean;
}

export const walletsApi = {
  list: async (includeArchived: boolean): Promise<WalletDto[]> =>
    (await http.get('/wallets', { params: { includeArchived } })).data,
  create: async (payload: WalletPayload): Promise<WalletDto> => (await http.post('/wallets', payload)).data,
  update: async (id: string, payload: WalletPayload): Promise<WalletDto> =>
    (await http.patch(`/wallets/${id}`, payload)).data,
  setValuation: async (id: string, value: string): Promise<{ wallet: WalletDto; adjustment: ValuationEntryDto | null }> =>
    (await http.post(`/wallets/${id}/valuation`, { value })).data,
  valuations: async (id: string): Promise<ValuationEntryDto[]> => (await http.get(`/wallets/${id}/valuations`)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/wallets/${id}`);
  },
};
