import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { walletsApi, WalletPayload } from './api';

export const walletKeys = {
  all: ['wallets'] as const,
  list: (includeArchived: boolean) => ['wallets', 'list', includeArchived] as const,
};

export function useWallets(includeArchived = false) {
  return useQuery({
    queryKey: walletKeys.list(includeArchived),
    queryFn: () => walletsApi.list(includeArchived),
  });
}

/** Saldo wallet berubah oleh transaksi, jadi dashboard & transaksi ikut di-refresh. */
function useInvalidateMoney() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: walletKeys.all });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateWallet() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (payload: WalletPayload) => walletsApi.create(payload), onSuccess: invalidate });
}

export function useUpdateWallet() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: WalletPayload }) => walletsApi.update(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteWallet() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (id: string) => walletsApi.remove(id), onSuccess: invalidate });
}

export function useSetValuation() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => walletsApi.setValuation(id, value),
    onSuccess: invalidate,
  });
}

export function useValuations(id: string | null) {
  return useQuery({
    queryKey: ['wallets', 'valuations', id],
    queryFn: () => walletsApi.valuations(id as string),
    enabled: id !== null,
  });
}
