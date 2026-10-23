import { z } from 'zod';
import { DateStringSchema, PositiveMoneyInputSchema, UuidSchema } from './common';

export const MAX_BILL_INTERVAL = 12;

const NameSchema = z.string().trim().min(1, 'Nama tagihan wajib diisi').max(60, 'Nama tagihan maksimal 60 karakter');
const IntervalSchema = z
  .number({ invalid_type_error: 'Interval harus angka' })
  .int('Interval harus bilangan bulat')
  .min(1, 'Minimal 1 bulan')
  .max(MAX_BILL_INTERVAL, `Maksimal ${MAX_BILL_INTERVAL} bulan`);
/** Hari sebelum jatuh tempo untuk pengingat (0 = di hari-H). */
const RemindDaysSchema = z
  .array(z.number().int().min(0).max(60))
  .max(5, 'Maksimal 5 pengingat')
  .transform((days) => [...new Set(days)].sort((a, b) => b - a));
const CategoryIdSchema = z.string().trim().min(1, 'Kategori wajib dipilih').max(100);

export const CreateBillSchema = z.object({
  name: NameSchema,
  amount: PositiveMoneyInputSchema,
  categoryId: CategoryIdSchema,
  walletId: UuidSchema.nullable().optional(),
  intervalMonths: IntervalSchema.default(1),
  nextDueDate: DateStringSchema,
  remindDays: RemindDaysSchema.default([7, 1]),
});
export type CreateBillInput = z.infer<typeof CreateBillSchema>;

export const UpdateBillSchema = z
  .object({
    name: NameSchema,
    amount: PositiveMoneyInputSchema,
    categoryId: CategoryIdSchema,
    walletId: UuidSchema.nullable(),
    intervalMonths: IntervalSchema,
    nextDueDate: DateStringSchema,
    remindDays: RemindDaysSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field harus diisi');
export type UpdateBillInput = z.infer<typeof UpdateBillSchema>;

/** Bayar tagihan: nominal boleh berbeda dari nominal tagihan (kenaikan harga). */
export const PayBillSchema = z.object({
  amount: PositiveMoneyInputSchema.optional(),
  walletId: UuidSchema.nullable().optional(),
  date: DateStringSchema.optional(),
  /** Jadikan nominal pembayaran ini sebagai nominal tagihan seterusnya. */
  updateBillAmount: z.boolean().optional(),
});
export type PayBillInput = z.infer<typeof PayBillSchema>;
