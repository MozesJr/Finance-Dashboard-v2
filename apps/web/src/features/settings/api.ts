import http from '@/lib/http';
import type { PeriodInfo } from 'shared';

export interface SettingsDto {
  periodStartDay: number;
  currentPeriod: PeriodInfo;
}

export const settingsApi = {
  get: async (): Promise<SettingsDto> => (await http.get('/settings')).data,
  update: async (periodStartDay: number): Promise<SettingsDto> => (await http.patch('/settings', { periodStartDay })).data,
};
