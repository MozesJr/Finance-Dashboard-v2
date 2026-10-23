import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billsApi, BillPayload, PayPayload } from './api';

export const billKeys = { all: ['bills'] as const };

export const useBills = (includeInactive: boolean) =>
  useQuery({ queryKey: ['bills', 'list', includeInactive], queryFn: () => billsApi.list(includeInactive) });

export const useBillsOverview = () => useQuery({ queryKey: ['bills', 'overview'], queryFn: billsApi.overview });

export const useBillPayments = (id: string | null) =>
  useQuery({ queryKey: ['bills', 'payments', id], queryFn: () => billsApi.payments(id as string), enabled: id !== null });

/** Membayar tagihan menyentuh transaksi, saldo, laporan dan checklist gajian, jadi semuanya di-refresh. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useCreateBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (p: BillPayload) => billsApi.create(p), onSuccess: invalidate });
}

export function useUpdateBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: BillPayload }) => billsApi.update(id, payload), onSuccess: invalidate });
}

export function usePayBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: PayPayload }) => billsApi.pay(id, payload), onSuccess: invalidate });
}
