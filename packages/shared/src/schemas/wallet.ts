import { z } from 'zod';
import { HexColorSchema, MoneyInputSchema } from './common';

export const WalletTypeEnum = z.enum(['CASH', 'BANK', 'EWALLET']);
export type WalletType = z.infer<typeof WalletTypeEnum>;

export const CreateWalletSchema = z.object({
  name: z.string().trim().min(1, 'Nama wallet wajib diisi').max(50, 'Nama wallet maksimal 50 karakter'),
  type: WalletTypeEnum,
  initialBalance: MoneyInputSchema.default(0),
  color: HexColorSchema.nullable().optional(),
});

export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;

export const UpdateWalletSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama wallet wajib diisi').max(50, 'Nama wallet maksimal 50 karakter'),
    type: WalletTypeEnum,
    initialBalance: MoneyInputSchema,
    color: HexColorSchema.nullable(),
    isArchived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');

export type UpdateWalletInput = z.infer<typeof UpdateWalletSchema>;

/** Bentuk response API (nominal sebagai string) */
export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: WalletTypeEnum,
  color: z.string().nullable(),
  isArchived: z.boolean(),
  initialBalance: z.string(),
  balance: z.string(),
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
