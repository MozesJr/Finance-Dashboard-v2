import { z } from 'zod';

export const TxTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export type TxType = z.infer<typeof TxTypeEnum>;

export const TxStatusEnum = z.enum(['DRAFT', 'CONFIRMED']);
export type TxStatus = z.infer<typeof TxStatusEnum>;

export const TxSourceEnum = z.enum(['WEB', 'TELEGRAM', 'WHATSAPP']);
export type TxSource = z.infer<typeof TxSourceEnum>;

export const CreateTransactionSchema = z.object({
  walletId: z.string().uuid(),
  toWalletId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  type: TxTypeEnum,
  amount: z.string().or(z.bigint()).pipe(
    z.coerce.bigint().positive('Amount must be positive')
  ),
  merchant: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  date: z.string().or(z.date()),
  source: TxSourceEnum.default('WEB'),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  walletId: z.string().uuid(),
  toWalletId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  type: TxTypeEnum,
  amount: z.string(),
  status: TxStatusEnum,
  merchant: z.string().nullable(),
  note: z.string().nullable(),
  date: z.string(),
  source: TxSourceEnum,
  receiptId: z.string().uuid().nullable(),
  aiConfidence: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
