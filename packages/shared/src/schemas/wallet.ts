import { z } from 'zod';

export const WalletTypeEnum = z.enum(['CASH', 'BANK', 'EWALLET']);
export type WalletType = z.infer<typeof WalletTypeEnum>;

export const CreateWalletSchema = z.object({
  name: z.string().min(1, 'Wallet name is required'),
  type: WalletTypeEnum,
  initialBalance: z
    .string()
    .or(z.bigint())
    .pipe(z.coerce.bigint().default(0n)),
});

export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;

export const WalletSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  type: WalletTypeEnum,
  initialBalance: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Wallet = z.infer<typeof WalletSchema>;
