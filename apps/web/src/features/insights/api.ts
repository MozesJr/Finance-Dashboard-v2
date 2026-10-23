import http from '@/lib/http';

export interface InsightDto {
  period: string;
  provisional: boolean;
  generatedAt: string;
  /** LLM = narasi AI; TEMPLATE = ringkasan otomatis tanpa AI. */
  source: 'LLM' | 'TEMPLATE';
  narrative: { summary: string; findings: string[]; suggestions: string[] };
}

export const insightsApi = {
  get: async (month: string): Promise<InsightDto | null> => (await http.get('/insights', { params: { month } })).data.insight,
  refresh: async (month: string): Promise<InsightDto> => (await http.post('/insights/refresh', { month })).data,
};
