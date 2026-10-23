import http from '@/lib/http';

export interface ChatMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export const aiChatApi = {
  history: async (): Promise<ChatMessageDto[]> => (await http.get('/ai/chat/history')).data,
  ask: async (message: string): Promise<{ reply: string; toolsUsed: string[] }> => (await http.post('/ai/chat', { message })).data,
  clear: async (): Promise<void> => {
    await http.delete('/ai/chat/history');
  },
};
