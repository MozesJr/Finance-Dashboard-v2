import http from '@/lib/http';
import type { TxType } from 'shared';

export interface TransactionDto {
  id: string;
  type: TxType;
  amount: string;
  status: string;
  date: string; // YYYY-MM-DD
  merchant: string | null;
  note: string | null;
  source: string;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  wallet: { id: string; name: string; color: string | null };
  toWallet: { id: string; name: string; color: string | null } | null;
  category: { id: string; name: string; color: string | null; icon: string | null } | null;
  createdAt: string;
}

export interface TransactionPage {
  items: TransactionDto[];
  nextCursor: string | null;
}

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: TxType;
  walletId?: string;
  categoryId?: string;
  q?: string;
}

export interface TransactionPayload {
  type?: TxType;
  walletId?: string;
  toWalletId?: string | null;
  categoryId?: string | null;
  amount?: string;
  date?: string;
  merchant?: string | null;
  note?: string | null;
}

const PAGE_SIZE = 20;

export const transactionsApi = {
  list: async (filters: TransactionFilters, cursor?: string): Promise<TransactionPage> => {
    const params: Record<string, string | number> = { limit: PAGE_SIZE };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    if (cursor) params.cursor = cursor;
    return (await http.get('/transactions', { params })).data;
  },
  create: async (payload: TransactionPayload): Promise<TransactionDto> => (await http.post('/transactions', payload)).data,
  update: async (id: string, payload: TransactionPayload): Promise<TransactionDto> =>
    (await http.patch(`/transactions/${id}`, payload)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/transactions/${id}`);
  },
};
