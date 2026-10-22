import { useQuery } from '@tanstack/react-query';
import type { CategoryType } from 'shared';
import { dashboardApi } from './api';

export const useSummary = (month: string) =>
  useQuery({ queryKey: ['dashboard', 'summary', month], queryFn: () => dashboardApi.summary(month) });

export const useByCategory = (month: string, type: CategoryType) =>
  useQuery({ queryKey: ['dashboard', 'by-category', month, type], queryFn: () => dashboardApi.byCategory(month, type) });

export const useTrend = (months = 6) =>
  useQuery({ queryKey: ['dashboard', 'trend', months], queryFn: () => dashboardApi.trend(months) });
