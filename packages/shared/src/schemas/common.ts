import { z } from 'zod';
import { parseNominal } from '../utils/money';

const MAX_AMOUNT = 9_000_000_000_000_000n; // batas aman di bawah BIGINT

/** Nominal rupiah: number integer atau string ("35rb", "1,2jt", "1.250.000") → bigint >= 0 */
export const MoneyInputSchema = z
  .union([z.string().trim().min(1, 'Nominal wajib diisi'), z.number(), z.bigint()])
  .transform((value, ctx) => {
    try {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) throw new Error('bukan bilangan bulat');
        return BigInt(value);
      }
      return parseNominal(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Format nominal tidak valid' });
      return z.NEVER;
    }
  })
  .refine((v) => v >= 0n, 'Nominal tidak boleh negatif')
  .refine((v) => v <= MAX_AMOUNT, 'Nominal terlalu besar');

/** Nominal transaksi: harus > 0 */
export const PositiveMoneyInputSchema = MoneyInputSchema.refine(
  (v) => v > 0n,
  'Nominal harus lebih dari 0',
);

export const UuidSchema = z.string().uuid('ID tidak valid');

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat #RRGGBB');

/** Tanggal kalender YYYY-MM-DD */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Tanggal tidak valid');

/** Bulan YYYY-MM */
export const MonthStringSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan harus berformat YYYY-MM');
