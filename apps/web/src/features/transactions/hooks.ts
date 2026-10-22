import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi, TransactionFilters, TransactionPayload } from './api';

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'list', filters],
    queryFn: ({ pageParam }) => transactionsApi.list(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] }); // saldo berubah
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (p: TransactionPayload) => transactionsApi.create(p), onSuccess: invalidate });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TransactionPayload }) => transactionsApi.update(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => transactionsApi.remove(id), onSuccess: invalidate });
}
