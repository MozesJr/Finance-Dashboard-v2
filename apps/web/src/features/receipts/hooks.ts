import { useMutation, useQuery } from '@tanstack/react-query';
import { receiptsApi } from './api';

export const useParseReceipt = () => useMutation({ mutationFn: (file: File) => receiptsApi.parse(file) });

export function useReceiptImage(receiptId: string | null) {
  return useQuery({
    queryKey: ['receipts', 'image', receiptId],
    queryFn: async () => URL.createObjectURL(await receiptsApi.imageBlob(receiptId as string)),
    enabled: receiptId !== null,
    staleTime: Infinity,
    gcTime: 60_000,
  });
}
