import { z } from 'zod';
import { DateStringSchema, HexColorSchema, MoneyInputSchema } from './common';

export const WalletTypeEnum = z.enum(['CASH', 'BANK', 'EWALLET', 'INVESTMENT']);
export type WalletType = z.infer<typeof WalletTypeEnum>;

export const CreateWalletSchema = z.object({
  name: z.string().trim().min(1, 'Nama wallet wajib diisi').max(50, 'Nama wallet maksimal 50 karakter'),
  type: WalletTypeEnum,
  initialBalance: MoneyInputSchema.default(0),
  color: HexColorSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
});

export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;

export const UpdateWalletSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama wallet wajib diisi').max(50, 'Nama wallet maksimal 50 karakter'),
    type: WalletTypeEnum,
    initialBalance: MoneyInputSchema,
    color: HexColorSchema.nullable(),
    isArchived: z.boolean(),
    isDefault: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');

export type UpdateWalletInput = z.infer<typeof UpdateWalletSchema>;

/** Bentuk response API (nominal sebagai string) */
export const InvestmentInfoSchema = z.object({
  /** saldo awal + transfer masuk − transfer keluar (tanpa penyesuaian nilai) */
  capital: z.string(),
  unrealized: z.string(),
  /** persen terhadap modal; null bila modal ≤ 0 */
  unrealizedPct: z.number().nullable(),
  lastAdjustedAt: z.string().nullable(),
});
export type InvestmentInfo = z.infer<typeof InvestmentInfoSchema>;

/** Input "Perbarui nilai": nilai pasar terkini dompet INVESTMENT (≥ 0). */
export const WalletValuationSchema = z.object({
  value: MoneyInputSchema,
  date: DateStringSchema.optional(),
});
export type WalletValuationInput = z.infer<typeof WalletValuationSchema>;

export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: WalletTypeEnum,
  color: z.string().nullable(),
  isArchived: z.boolean(),
  isDefault: z.boolean(),
  initialBalance: z.string(),
  balance: z.string(),
  investment: InvestmentInfoSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Wallet = z.infer<typeof WalletSchema>;

export const WalletListQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type WalletListQuery = z.infer<typeof WalletListQuerySchema>;
