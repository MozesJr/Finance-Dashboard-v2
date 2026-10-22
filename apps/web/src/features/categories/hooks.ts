import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryType } from 'shared';
import { categoriesApi, CategoryPayload } from './api';

export function useCategories(type?: CategoryType) {
  return useQuery({
    queryKey: ['categories', type ?? 'all'],
    queryFn: () => categoriesApi.list(type),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    // nama/warna kategori tampil di transaksi & dashboard
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (p: CategoryPayload) => categoriesApi.create(p), onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CategoryPayload }) => categoriesApi.update(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => categoriesApi.remove(id), onSuccess: invalidate });
}
