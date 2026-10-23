import http from '@/lib/http';

export interface TelegramStatusDto {
  botEnabled: boolean;
  botUsername: string | null;
  linked: { username: string | null; linkedAt: string } | null;
}

export interface LinkCodeDto {
  code: string;
  expiresAt: string;
  botUsername: string | null;
}

export const telegramApi = {
  status: async (): Promise<TelegramStatusDto> => (await http.get('/telegram/status')).data,
  createCode: async (): Promise<LinkCodeDto> => (await http.post('/telegram/link-code')).data,
  unlink: async (): Promise<void> => {
    await http.delete('/telegram/link');
  },
};
