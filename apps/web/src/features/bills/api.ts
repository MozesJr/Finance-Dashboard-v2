import http from '@/lib/http';

export type BillStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'INACTIVE';

export interface BillDto {
  id: string;
  name: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  walletId: string | null;
  walletName: string | null;
  payWalletName: string | null;
  intervalMonths: number;
  nextDueDate: string;
  isActive: boolean;
  remindDays: number[];
  snoozedUntil: string | null;
  daysUntilDue: number;
  status: BillStatus;
  reservePerPeriod: string;
  accumulated: string;
  lastPaidOn: string | null;
}

export interface BillsOverviewDto {
  bills: BillDto[];
  nextDue: BillDto | null;
  totalReserve: string;
  totalPerPeriod: string;
  defaultWallet: { id: string; name: string; balance: string } | null;
  freeMoney: string | null;
}

export interface BillPaymentDto {
  id: string;
  amount: string;
  dueDate: string;
  paidOn: string;
  transactionId: string | null;
}

export interface BillPayload {
  name?: string;
  amount?: string;
  categoryId?: string;
  walletId?: string | null;
  intervalMonths?: number;
  nextDueDate?: string;
  remindDays?: number[];
  isActive?: boolean;
}

export interface PayPayload {
  amount?: string;
  walletId?: string | null;
  date?: string;
  updateBillAmount?: boolean;
}

export const billsApi = {
  list: async (includeInactive: boolean): Promise<BillDto[]> => (await http.get('/bills', { params: { includeInactive } })).data,
  overview: async (): Promise<BillsOverviewDto> => (await http.get('/bills/overview')).data,
  create: async (payload: BillPayload): Promise<BillDto> => (await http.post('/bills', payload)).data,
  update: async (id: string, payload: BillPayload): Promise<BillDto> => (await http.patch(`/bills/${id}`, payload)).data,
  pay: async (id: string, payload: PayPayload): Promise<{ status: string; transactionId: string; message: string }> =>
    (await http.post(`/bills/${id}/pay`, payload)).data,
  payments: async (id: string): Promise<BillPaymentDto[]> => (await http.get(`/bills/${id}/payments`)).data,
};
