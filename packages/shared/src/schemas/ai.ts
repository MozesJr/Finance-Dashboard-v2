import { z } from 'zod';
import { DateStringSchema } from './common';
import { TxTypeEnum } from './transaction';

/** Hasil ekstraksi LLM untuk teks bebas. ID kategori/dompet divalidasi terhadap daftar milik user di server. */
export const AiTransactionSchema = z.object({
  type: TxTypeEnum,
  /** Rupiah bulat; null bila teks tidak memuat nominal. */
  amount: z.number().int().positive().nullable(),
  categoryId: z.string().min(1).nullable(),
  walletId: z.string().min(1).nullable(),
  toWalletId: z.string().min(1).nullable(),
  date: DateStringSchema.nullable(),
  merchant: z.string().trim().max(100).nullable(),
  note: z.string().trim().max(200).nullable(),
  confidence: z.number().min(0).max(1),
});
export type AiTransactionOutput = z.infer<typeof AiTransactionSchema>;

export const ReceiptItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  qty: z.number().positive().max(10_000),
  /** Harga total baris (rupiah). */
  price: z.number().int().nonnegative(),
});

export const ReceiptExtractionSchema = z.object({
  merchant: z.string().trim().max(120).nullable(),
  date: DateStringSchema.nullable(),
  total: z.number().int().nonnegative(),
  items: z.array(ReceiptItemSchema).max(60),
  paymentMethod: z.string().trim().max(60).nullable(),
});
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

export const InsightNarrativeSchema = z.object({
  summary: z.string().trim().min(10).max(700),
  findings: z.array(z.string().trim().min(5).max(350)).length(3),
  suggestions: z.array(z.string().trim().min(5).max(350)).length(3),
});
export type InsightNarrative = z.infer<typeof InsightNarrativeSchema>;

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Pertanyaan tidak boleh kosong').max(1000, 'Pertanyaan maksimal 1000 karakter'),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
