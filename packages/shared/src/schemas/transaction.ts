import { z } from 'zod';
import { DateStringSchema, PositiveMoneyInputSchema, UuidSchema } from './common';

export const TxTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export type TxType = z.infer<typeof TxTypeEnum>;

export const TxStatusEnum = z.enum(['DRAFT', 'CONFIRMED']);
export type TxStatus = z.infer<typeof TxStatusEnum>;

export const TxSourceEnum = z.enum(['WEB', 'TELEGRAM', 'WHATSAPP']);
export type TxSource = z.infer<typeof TxSourceEnum>;

/** ID kategori bisa non-UUID (kategori sistem memakai slug, mis. "cat-expense-makan"). */
const CategoryIdSchema = z.string().trim().min(1, 'ID kategori tidak valid').max(100);

const TextSchema = z.string().trim().max(200, 'Maksimal 200 karakter');

export const MAX_SPREAD_PERIODS = 12;

/** Bagi ke N periode (1–12) untuk laporan; hanya pengeluaran. */
export const SpreadPeriodsSchema = z
  .number({ invalid_type_error: 'Jumlah periode harus angka' })
  .int('Jumlah periode harus bilangan bulat')
  .min(1, 'Minimal 1 periode')
  .max(MAX_SPREAD_PERIODS, `Maksimal ${MAX_SPREAD_PERIODS} periode`);

export interface TransactionShape {
  type: TxType;
  spreadPeriods?: number;
  walletId: string;
  toWalletId?: string | null;
  categoryId?: string | null;
}

/**
 * Aturan bentuk transaksi (dipakai schema create dan service saat PATCH).
 * Mengembalikan pesan error atau null jika valid.
 */
export function checkTransactionShape(tx: TransactionShape): { field: string; message: string } | null {
  if ((tx.spreadPeriods ?? 1) > 1 && tx.type !== 'EXPENSE') {
    return { field: 'spreadPeriods', message: 'Pembagian ke beberapa periode hanya untuk pengeluaran' };
  }
  if (tx.type === 'TRANSFER') {
    if (!tx.toWalletId) return { field: 'toWalletId', message: 'Wallet tujuan wajib diisi untuk transfer' };
    if (tx.toWalletId === tx.walletId) {
      return { field: 'toWalletId', message: 'Wallet asal dan tujuan tidak boleh sama' };
    }
    if (tx.categoryId) return { field: 'categoryId', message: 'Transfer tidak memakai kategori' };
    return null;
  }
  if (!tx.categoryId) return { field: 'categoryId', message: 'Kategori wajib diisi' };
  if (tx.toWalletId) return { field: 'toWalletId', message: 'Wallet tujuan hanya untuk transfer' };
  return null;
}

export const CreateTransactionSchema = z
  .object({
    type: TxTypeEnum,
    walletId: UuidSchema,
    toWalletId: UuidSchema.nullable().optional(),
    categoryId: CategoryIdSchema.nullable().optional(),
    amount: PositiveMoneyInputSchema,
    date: DateStringSchema.optional(),
    /** Pengeluaran dibagi rata ke N periode berturut-turut untuk laporan (saldo dompet tidak terpengaruh). */
    spreadPeriods: SpreadPeriodsSchema.default(1),
    merchant: TextSchema.nullable().optional(),
    note: TextSchema.nullable().optional(),
    /** Struk hasil unggahan (milik user) yang dilampirkan ke transaksi. */
    receiptId: UuidSchema.nullable().optional(),
  })
  .superRefine((tx, ctx) => {
    const problem = checkTransactionShape(tx);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [problem.field], message: problem.message });
  });

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export const UpdateTransactionSchema = z
  .object({
    type: TxTypeEnum,
    walletId: UuidSchema,
    toWalletId: UuidSchema.nullable(),
    categoryId: CategoryIdSchema.nullable(),
    amount: PositiveMoneyInputSchema,
    date: DateStringSchema,
    spreadPeriods: SpreadPeriodsSchema,
    merchant: TextSchema.nullable(),
    note: TextSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;

export const TransactionListQuerySchema = z
  .object({
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    type: TxTypeEnum.optional(),
    /** Default CONFIRMED; DRAFT hanya bila diminta eksplisit. */
    status: TxStatusEnum.optional(),
    walletId: UuidSchema.optional(),
    categoryId: CategoryIdSchema.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int('Limit harus bilangan bulat').min(1, 'Limit minimal 1').max(100, 'Limit maksimal 100').default(20),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: 'dateFrom tidak boleh setelah dateTo',
    path: ['dateFrom'],
  });

export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;
