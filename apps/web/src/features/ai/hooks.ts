import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiChatApi } from './api';

const KEY = ['ai', 'chat'] as const;

export const useChatHistory = (enabled: boolean) => useQuery({ queryKey: KEY, queryFn: aiChatApi.history, enabled });

export function useAskAi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => aiChatApi.ask(message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useClearChat() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: aiChatApi.clear, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}
