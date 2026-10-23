import http from '@/lib/http';
import type { PeriodInfo } from 'shared';

export interface ChecklistItemDto {
  key: string;
  kind: 'SAVING' | 'EXPENSE_SINGLE' | 'EXPENSE_INFO' | 'INCOME';
  name: string;
  icon: string | null;
  amount: string;
  done: boolean;
  goalId?: string;
  goalName?: string;
  needsDestination?: boolean;
  categoryId?: string;
  planIncome?: string;
}

export interface ChecklistDto {
  period: PeriodInfo;
  salary: { id: string; amount: string; walletId: string; walletName: string; date: string };
  hasPlan: boolean;
  phase: number | null;
  items: ChecklistItemDto[];
}

export interface ActionResultDto {
  status: 'DONE' | 'DRAFT' | 'ALREADY';
  message: string;
}

export const paydayApi = {
  get: async (): Promise<{ checklist: ChecklistDto | null }> => (await http.get('/payday')).data,
  run: async (itemKey: string, periodKey: string, destinationWalletId?: string | null): Promise<ActionResultDto> =>
    (await http.post('/payday/actions', { itemKey, periodKey, destinationWalletId: destinationWalletId ?? null })).data,
};
