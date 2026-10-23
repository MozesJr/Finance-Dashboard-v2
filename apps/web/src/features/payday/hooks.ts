import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paydayApi } from './api';

export const paydayKey = ['payday'] as const;

export function usePayday() {
  return useQuery({ queryKey: paydayKey, queryFn: paydayApi.get });
}

export function useRunPaydayAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemKey: string; periodKey: string; destinationWalletId?: string | null }) =>
      paydayApi.run(v.itemKey, v.periodKey, v.destinationWalletId),
    // Aksi menyentuh tabungan, dompet, transaksi, dan alokasi.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
