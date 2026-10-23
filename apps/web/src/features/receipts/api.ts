import http from '@/lib/http';

export interface ReceiptItemDto {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptParseDto {
  receiptId: string;
  merchant: string | null;
  date: string;
  /** Rupiah (string). */
  total: string;
  items: ReceiptItemDto[];
  paymentMethod: string | null;
  notes: string[];
  suggestedCategoryId: string | null;
  suggestedWalletId: string | null;
  imageUrl: string;
}

export const receiptsApi = {
  parse: async (file: File): Promise<ReceiptParseDto> => {
    const form = new FormData();
    form.append('file', file);
    return (await http.post('/receipts/parse', form)).data;
  },
  /** Gambar dilindungi cookie sesi, jadi diambil sebagai blob (bukan <img src> langsung ke URL publik). */
  imageBlob: async (receiptId: string): Promise<Blob> => (await http.get(`/receipts/${receiptId}/image`, { responseType: 'blob' })).data,
};
