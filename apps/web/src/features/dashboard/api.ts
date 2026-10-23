import http from '@/lib/http';
import type { CategoryType, PeriodInfo } from 'shared';

export interface MonthTotals {
  totalIncome: string;
  totalExpense: string;
  net: string;
}

export interface SummaryDto extends MonthTotals {
  /** Kunci periode (YYYY-MM). */
  month: string;
  previousMonth: string;
  period: PeriodInfo;
  previousPeriod: PeriodInfo;
  previous: MonthTotals;
  change: { income: number | null; expense: number | null; net: number | null };
  totalBalance: string;
}

export interface ByCategoryItem {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  percent: number;
  count: number;
}

export interface ByCategoryDto {
  month: string;
  period: PeriodInfo;
  type: CategoryType;
  total: string;
  items: ByCategoryItem[];
}

export interface TrendItem {
  month: string;
  label: string;
  income: string;
  expense: string;
  net: string;
}

export const dashboardApi = {
  summary: async (month: string): Promise<SummaryDto> => (await http.get('/dashboard/summary', { params: { month } })).data,
  byCategory: async (month: string, type: CategoryType): Promise<ByCategoryDto> =>
    (await http.get('/dashboard/by-category', { params: { month, type } })).data,
  trend: async (months: number): Promise<{ months: TrendItem[] }> =>
    (await http.get('/dashboard/trend', { params: { months } })).data,
};
