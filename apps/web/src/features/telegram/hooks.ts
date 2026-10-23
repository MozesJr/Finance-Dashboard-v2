import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { telegramApi } from './api';

/** poll: polling ringan (3 dtk) selama menunggu pengguna mengirim /link di Telegram; berhenti begitu terhubung. */
export const useTelegramStatus = (poll = false) =>
  useQuery({
    queryKey: ['telegram', 'status'],
    queryFn: telegramApi.status,
    refetchInterval: (query) => (poll && !query.state.data?.linked ? 3000 : false),
  });

export function useCreateLinkCode() {
  return useMutation({ mutationFn: telegramApi.createCode });
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: telegramApi.unlink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram'] }),
  });
}
