import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentMonthJakarta } from 'shared';
import { useState } from 'react';
import { settingsApi } from './api';

export const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: settingsApi.get, staleTime: 5 * 60 * 1000 });
}

/** Mengubah tanggal mulai periode mengubah semua angka per periode, jadi seluruh cache di-refresh. */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodStartDay: number) => settingsApi.update(periodStartDay),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Periode terpilih (kunci YYYY-MM); default periode yang memuat hari ini menurut pengaturan user. */
export function usePeriodSelection(): [string, (key: string) => void] {
  const { data } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  return [selected ?? data?.currentPeriod.key ?? getCurrentMonthJakarta(), setSelected];
}
