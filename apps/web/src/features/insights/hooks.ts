import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { insightsApi } from './api';

export const useInsight = (month: string) => useQuery({ queryKey: ['insights', month], queryFn: () => insightsApi.get(month) });

export function useRefreshInsight(month: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => insightsApi.refresh(month),
    onSuccess: (data) => queryClient.setQueryData(['insights', month], data),
  });
}
