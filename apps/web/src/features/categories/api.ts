import http from '@/lib/http';
import type { CategoryType } from 'shared';

export interface CategoryDto {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  createdAt: string;
}

export interface CategoryPayload {
  name?: string;
  type?: CategoryType;
  icon?: string | null;
  color?: string | null;
}

export const categoriesApi = {
  list: async (type?: CategoryType): Promise<CategoryDto[]> =>
    (await http.get('/categories', { params: type ? { type } : {} })).data,
  create: async (payload: CategoryPayload): Promise<CategoryDto> => (await http.post('/categories', payload)).data,
  update: async (id: string, payload: CategoryPayload): Promise<CategoryDto> =>
    (await http.patch(`/categories/${id}`, payload)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/categories/${id}`);
  },
};
